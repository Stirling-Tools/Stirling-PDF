package stirling.software.proprietary.policy.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.input.ResolveContext;
import stirling.software.proprietary.policy.input.ResolvedInput;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.PolicyRunStatus;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.policy.source.EditorSource;
import stirling.software.proprietary.policy.source.InProcessSourceDocCounter;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;

/**
 * Tests for {@link PolicyRunner}: the one place that turns a policy's sources into runs, and the
 * orchestrator of ledger hygiene (presence stamping + cleanup on complete FULL sweeps).
 */
@ExtendWith(MockitoExtension.class)
class PolicyRunnerTest {

    @Mock private PolicyEngine policyEngine;
    @Mock private InputSource folderSource;
    @Mock private ProcessedLedger processedLedger;

    private final SourceStore sourceStore = new InProcessSourceStore();
    private final InProcessSourceDocCounter docCounter = new InProcessSourceDocCounter();
    private PolicyRunner runner;

    @BeforeEach
    void setUp() {
        runner =
                new PolicyRunner(
                        policyEngine,
                        List.of(folderSource),
                        sourceStore,
                        docCounter,
                        processedLedger,
                        new ApplicationProperties(),
                        reachableOwners());
    }

    @Test
    void runsOnceWithNoFilesWhenThePolicyHasNoSources() {
        Policy policy = policy(List.of());
        when(policyEngine.runPolicy(eq(policy), any(), any(), any(), any(), any()))
                .thenReturn(new PolicyRunHandle("r", new CompletableFuture<>()));

        runner.run(policy);

        ArgumentCaptor<PolicyInputs> inputs = ArgumentCaptor.forClass(PolicyInputs.class);
        verify(policyEngine).runPolicy(eq(policy), inputs.capture(), any(), any(), any(), any());
        assertTrue(inputs.getValue().primary().isEmpty());
        // Ledger hygiene still runs: rows recorded for a generator policy's folder outputs
        // are pruned by its own sweeps rather than accumulating until the policy is deleted.
        verify(processedLedger).deleteUnseen(eq("p1"), anyLong());
    }

    @Test
    void reportsWhatTheSweepSkippedSoAnEmptyTriggerExplainsItself() throws Exception {
        InProcessProcessedLedger ledger = new InProcessProcessedLedger();
        PolicyRunner reporting =
                new PolicyRunner(
                        policyEngine,
                        List.of(folderSource),
                        sourceStore,
                        new InProcessSourceDocCounter(),
                        ledger,
                        new ApplicationProperties(),
                        reachableOwners());
        InputSpec spec = InputSpec.folder("/in");
        Policy policy = policy(List.of(spec));
        // One file already processed at its current version, one parked by a failed run.
        ledger.claim("p1", "/in/done.pdf", "g1", null);
        ledger.settle("p1", "/in/done.pdf", "g1", null, true);
        ledger.claim("p1", "/in/failed.pdf", "g2", null);
        ledger.settle("p1", "/in/failed.pdf", "g2", null, false);
        when(folderSource.supports(spec)).thenReturn(true);
        when(folderSource.resolve(eq(spec), any()))
                .thenAnswer(
                        invocation -> {
                            ResolveContext ctx = invocation.getArgument(1);
                            ctx.reportPresent(List.of("/in/done.pdf", "/in/failed.pdf"));
                            // Both are at their settled versions, so neither claims.
                            return List.of();
                        });

        SweepOutcome outcome = reporting.run(policy);

        assertTrue(outcome.runIds().isEmpty());
        assertEquals(2, outcome.filesListed());
        assertEquals(1, outcome.alreadyProcessed());
        assertEquals(1, outcome.parked());
        assertEquals(0, outcome.inFlight());
    }

    @Test
    void pullsEverySourceAndRunsOnePerUnitOfWork() throws Exception {
        InputSpec spec = InputSpec.folder("/in");
        Policy policy = policy(List.of(spec));
        when(folderSource.supports(spec)).thenReturn(true);
        when(folderSource.resolve(eq(spec), any()))
                .thenReturn(
                        List.of(
                                ResolvedInput.of(PolicyInputs.of(List.of())),
                                ResolvedInput.of(PolicyInputs.of(List.of()))));
        when(policyEngine.runPolicy(any(), any(), any(), any(), any(), any()))
                .thenReturn(new PolicyRunHandle("r", new CompletableFuture<>()));

        runner.run(policy);

        verify(policyEngine, times(2)).runPolicy(eq(policy), any(), any(), any(), any(), any());
    }

    @Test
    void feedsEachUnitsCompletionHookTheRunOutcome() throws Exception {
        InputSpec spec = InputSpec.folder("/in");
        Policy policy = policy(List.of(spec));
        AtomicBoolean outcome = new AtomicBoolean(false);
        ResolvedInput unit = new ResolvedInput(PolicyInputs.of(List.of()), null, outcome::set);
        when(folderSource.supports(spec)).thenReturn(true);
        when(folderSource.resolve(eq(spec), any())).thenReturn(List.of(unit));
        CompletableFuture<PolicyRun> completion = new CompletableFuture<>();
        when(policyEngine.runPolicy(any(), any(), any(), any(), any(), any()))
                .thenReturn(new PolicyRunHandle("r", completion));

        runner.run(policy);

        PolicyRun run = mock(PolicyRun.class);
        when(run.getStatus()).thenReturn(PolicyRunStatus.COMPLETED);
        completion.complete(run);

        assertTrue(outcome.get());
    }

    @Test
    void reportsFailureToTheCompletionHookWhenTheRunDoesNotComplete() throws Exception {
        InputSpec spec = InputSpec.folder("/in");
        Policy policy = policy(List.of(spec));
        AtomicBoolean outcome = new AtomicBoolean(true);
        ResolvedInput unit = new ResolvedInput(PolicyInputs.of(List.of()), null, outcome::set);
        when(folderSource.supports(spec)).thenReturn(true);
        when(folderSource.resolve(eq(spec), any())).thenReturn(List.of(unit));
        CompletableFuture<PolicyRun> completion = new CompletableFuture<>();
        when(policyEngine.runPolicy(any(), any(), any(), any(), any(), any()))
                .thenReturn(new PolicyRunHandle("r", completion));

        runner.run(policy);
        completion.completeExceptionally(new RuntimeException("boom"));

        assertFalse(outcome.get());
    }

    @Test
    void skipsSourcesWithNoMatchingBean() {
        InputSpec spec = new InputSpec("s3", Map.of());
        Policy policy = policy(List.of(spec));
        when(folderSource.supports(spec)).thenReturn(false);

        runner.run(policy);

        verifyNoInteractions(policyEngine);
    }

    @Test
    void aFullSweepStampsPresenceAndPrunesUnseenRows() throws Exception {
        InputSpec spec = InputSpec.folder("/in");
        Policy policy = policy(List.of(spec));
        when(folderSource.supports(spec)).thenReturn(true);
        when(folderSource.listsExhaustively()).thenReturn(true);
        when(folderSource.resolve(eq(spec), any()))
                .thenAnswer(
                        invocation -> {
                            ResolveContext ctx = invocation.getArgument(1);
                            ctx.reportPresent(List.of("/in/a.pdf", "/in/b.pdf"));
                            return List.of();
                        });

        runner.run(policy);

        // Presence reporting also bulk-prefetches claim state: one lookup for the whole listing.
        verify(processedLedger).statesFor(eq("p1"), eq(List.of("/in/a.pdf", "/in/b.pdf")));
        verify(processedLedger).markSeen("p1", Set.of("/in/a.pdf", "/in/b.pdf"));
        verify(processedLedger).deleteUnseen(eq("p1"), anyLong());
    }

    @Test
    void aLightSweepClaimsButSkipsLedgerHygiene() throws Exception {
        InputSpec spec = InputSpec.folder("/in");
        Policy policy = policy(List.of(spec));
        when(folderSource.supports(spec)).thenReturn(true);
        when(folderSource.resolve(eq(spec), any()))
                .thenReturn(List.of(ResolvedInput.of(PolicyInputs.of(List.of()))));
        when(policyEngine.runPolicy(any(), any(), any(), any(), any(), any()))
                .thenReturn(new PolicyRunHandle("r", new CompletableFuture<>()));

        runner.run(policy, SweepKind.LIGHT);

        verify(policyEngine).runPolicy(eq(policy), any(), any(), any(), any(), any());
        verify(processedLedger, never()).markSeen(any(), any());
        verify(processedLedger, never()).deleteUnseen(any(), anyLong());
    }

    @Test
    void aSourceThatFailsToResolveVetoesCleanupButOthersStillRun() throws Exception {
        InputSpec broken = InputSpec.folder("/broken");
        InputSpec healthy = InputSpec.folder("/healthy");
        Policy policy = policy(List.of(broken, healthy));
        when(folderSource.supports(any())).thenReturn(true);
        when(folderSource.listsExhaustively()).thenReturn(true);
        when(folderSource.resolve(eq(broken), any())).thenThrow(new IOException("mount gone"));
        when(folderSource.resolve(eq(healthy), any()))
                .thenReturn(List.of(ResolvedInput.of(PolicyInputs.of(List.of()))));
        when(policyEngine.runPolicy(any(), any(), any(), any(), any(), any()))
                .thenReturn(new PolicyRunHandle("r", new CompletableFuture<>()));

        runner.run(policy);

        verify(policyEngine)
                .runPolicy(
                        eq(policy), any(), any(), any(), any(), any()); // healthy source still ran
        verify(processedLedger, never()).deleteUnseen(any(), anyLong()); // history preserved
    }

    @Test
    void aDisabledSourceVetoesCleanup() {
        InputSpec spec = InputSpec.folder("/in");
        String pausedId = sourceStore.save(disabledSourceFrom(spec)).id();
        Policy policy = policyReferencing(List.of(pausedId));

        runner.run(policy);

        verify(processedLedger, never()).deleteUnseen(any(), anyLong());
    }

    @Test
    void aNonExhaustiveSourceVetoesCleanup() throws Exception {
        InputSpec spec = InputSpec.folder("/in");
        Policy policy = policy(List.of(spec));
        when(folderSource.supports(spec)).thenReturn(true);
        when(folderSource.listsExhaustively()).thenReturn(false);
        when(folderSource.resolve(eq(spec), any())).thenReturn(List.of());

        runner.run(policy);

        verify(processedLedger, never()).deleteUnseen(any(), anyLong());
    }

    @Test
    void aMissingSourceDoesNotVetoCleanup() {
        // A deleted source's rows age out precisely because cleanup still runs.
        Policy policy = policyReferencing(List.of("ghost-source-id"));

        runner.run(policy);

        verify(processedLedger).deleteUnseen(eq("p1"), anyLong());
    }

    @Test
    void runWithSuppliedInputsBypassesSources() {
        Policy policy = policy(List.of(InputSpec.folder("/in")));
        PolicyInputs inputs = PolicyInputs.of(List.of());
        PolicyRunHandle handle = new PolicyRunHandle("r", new CompletableFuture<>());
        when(policyEngine.runPolicy(policy, inputs, PolicyProgressListener.NOOP, null, null))
                .thenReturn(handle);

        assertSame(handle, runner.runWith(policy, inputs, PolicyProgressListener.NOOP, null));
        verifyNoInteractions(folderSource);
    }

    @Test
    void anAttendedRunCarriesTheClientsOwnDocumentReferenceAndNoSource() {
        // A failure of this run can then name the document the user is still holding, and the null
        // sourceId is what marks the reference as the client's own rather than a source's hash.
        Policy policy = policy(List.of());
        PolicyInputs inputs = PolicyInputs.of(List.of(new ByteArrayResource("a".getBytes())));
        when(policyEngine.runPolicy(
                        policy, inputs, PolicyProgressListener.NOOP, null, "editor-file-1"))
                .thenReturn(new PolicyRunHandle("r", new CompletableFuture<>()));

        runner.runWith(policy, inputs, PolicyProgressListener.NOOP, "editor-file-1");

        verify(policyEngine)
                .runPolicy(policy, inputs, PolicyProgressListener.NOOP, null, "editor-file-1");
    }

    @Test
    void anUnattendedRunCarriesItsSourcesIdentityByName() throws Exception {
        // The identity reaches the run as the source produced it - name-shaped, so the run can
        // be displayed by the file it processes and a released claim resolves in the ledger.
        InputSpec spec = InputSpec.folder("/in");
        Policy policy = policy(List.of(spec));
        String sourceId = policy.inputs().getFirst().sourceId();
        when(folderSource.supports(spec)).thenReturn(true);
        when(folderSource.resolve(eq(spec), any()))
                .thenReturn(
                        List.of(
                                ResolvedInput.forFile(
                                        PolicyInputs.of(List.of()), "/in/doc.pdf", success -> {})));
        when(policyEngine.runPolicy(any(), any(), any(), any(), any(), any()))
                .thenReturn(new PolicyRunHandle("r", new CompletableFuture<>()));

        runner.run(policy);

        verify(policyEngine)
                .runPolicy(eq(policy), any(), any(), eq(sourceId), eq("/in/doc.pdf"), any());
    }

    @Test
    void runWithRecordsSuppliedDocsAgainstTheEditorSourceForThePolicyTeam() {
        Policy policy =
                new Policy(
                        "p1",
                        "p",
                        "owner",
                        true,
                        List.of(),
                        List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                        OutputSpec.inline(),
                        7L);
        PolicyInputs inputs =
                PolicyInputs.of(
                        List.of(
                                new ByteArrayResource("a".getBytes()),
                                new ByteArrayResource("b".getBytes())));
        when(policyEngine.runPolicy(
                        policy, inputs, PolicyProgressListener.NOOP, null, "editor-file-1"))
                .thenReturn(new PolicyRunHandle("r", new CompletableFuture<>()));

        runner.runWith(policy, inputs, PolicyProgressListener.NOOP, "editor-file-1");

        String key = EditorSource.counterKey(7L);
        assertEquals(2, docCounter.statsFor(List.of(key)).get(key).total());
    }

    @Test
    void anOwnerlessProcessingFolderIsNotSweptUnderLogin() {
        // Created while login was disabled, so stamped with no owner; enabling login strands it
        // where no user can list, pause, revert, or delete it. Sweeping it anyway would keep
        // replacing files in place in a folder nobody can reach.
        assertNotSwept(policy(List.of()).withOwner(null));
    }

    @Test
    void aProcessingFolderWhoseOwnerNoLongerExistsIsNotSwept() {
        // Renaming or deleting the owner strands the folder the same way a null owner does: the
        // stamped name matches no user, so the owner check fails for everyone.
        assertNotSwept(policy(List.of()).withOwner("renamed-away"));
    }

    /** Asserts the engine refuses this processing folder under login, and starts no run. */
    private void assertNotSwept(Policy stranded) {
        ApplicationProperties loginOn = new ApplicationProperties();
        loginOn.getSecurity().setEnableLogin(true);
        PolicyRunner enforced =
                new PolicyRunner(
                        policyEngine,
                        List.of(folderSource),
                        sourceStore,
                        docCounter,
                        processedLedger,
                        loginOn,
                        guardOver(loginOn, noUsers()));

        SweepOutcome outcome = enforced.run(stranded.withSurface(Policy.SURFACE_PROCESSING_FOLDER));

        assertTrue(outcome.runIds().isEmpty());
        verifyNoInteractions(policyEngine);
    }

    /** A guard with login off, so it reports no orphans and never reads a user. */
    private static PolicyAccessGuard reachableOwners() {
        return guardOver(new ApplicationProperties(), mock(UserServiceInterface.class));
    }

    /** A user service with an empty users table: every stamped owner reads as gone. */
    private static UserServiceInterface noUsers() {
        UserServiceInterface users = mock(UserServiceInterface.class);
        // lenient: a null owner is stranded without the guard ever reaching the lookup.
        lenient().when(users.usernameExists(any())).thenReturn(false);
        return users;
    }

    private static PolicyAccessGuard guardOver(
            ApplicationProperties properties, UserServiceInterface users) {
        return new PolicyAccessGuard(users, properties, mock(PolicyManagementAuthority.class));
    }

    /** Persists each spec as a source and returns a policy referencing them by id. */
    private Policy policy(List<InputSpec> sources) {
        List<String> sourceIds =
                sources.stream().map(spec -> sourceStore.save(sourceFrom(spec)).id()).toList();
        return policyReferencing(sourceIds);
    }

    private static Policy policyReferencing(List<String> sourceIds) {
        return new Policy(
                "p1",
                "p",
                "owner",
                true,
                sourceIds.stream().map(PipelineInput::manual).toList(),
                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                OutputSpec.inline());
    }

    private static Source sourceFrom(InputSpec spec) {
        return new Source(null, "src", spec.type(), spec.options(), true, "owner", null);
    }

    private static Source disabledSourceFrom(InputSpec spec) {
        return new Source(null, "src", spec.type(), spec.options(), false, "owner", null);
    }

    @Test
    void awaitQuiesceReturnsOnceRunsSettle() {
        when(policyEngine.hasActiveRuns("p1")).thenReturn(true, false);

        assertTrue(runner.awaitQuiesce("p1", java.time.Duration.ofSeconds(2)));
    }

    @Test
    void awaitQuiesceTimesOutOnARunThatNeverSettles() {
        when(policyEngine.hasActiveRuns("p1")).thenReturn(true);

        assertFalse(runner.awaitQuiesce("p1", java.time.Duration.ofMillis(50)));
    }

    @Test
    void aQueueFullRejectionReleasesTheClaimForTheNextSweep() throws Exception {
        InputSpec spec = InputSpec.folder("/in");
        Policy policy = policy(List.of(spec));
        java.util.concurrent.atomic.AtomicBoolean outcome =
                new java.util.concurrent.atomic.AtomicBoolean(true);
        ResolvedInput unit =
                new ResolvedInput(PolicyInputs.of(List.of()), "/in/doc.pdf", outcome::set);
        when(folderSource.supports(spec)).thenReturn(true);
        when(folderSource.resolve(eq(spec), any())).thenReturn(List.of(unit));
        CompletableFuture<PolicyRun> completion = new CompletableFuture<>();
        when(policyEngine.runPolicy(any(), any(), any(), any(), any(), any()))
                .thenReturn(new PolicyRunHandle("r", completion));
        runner.run(policy);

        PolicyRun run = mock(PolicyRun.class);
        when(run.getStatus()).thenReturn(PolicyRunStatus.FAILED);
        when(run.getErrorCode()).thenReturn("POLICY_QUEUE_FULL");
        completion.complete(run);

        // Nothing was attempted on the file: the claim is dropped, not parked failed.
        assertFalse(outcome.get());
        verify(processedLedger).forget("p1", "/in/doc.pdf");
    }
}
