package stirling.software.proprietary.policy.engine;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
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

import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.input.ResolveContext;
import stirling.software.proprietary.policy.input.ResolvedInput;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.PolicyRunStatus;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
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
    private PolicyRunner runner;

    @BeforeEach
    void setUp() {
        runner =
                new PolicyRunner(
                        policyEngine,
                        List.of(folderSource),
                        sourceStore,
                        new InProcessSourceDocCounter(),
                        processedLedger);
    }

    @Test
    void runsOnceWithNoFilesWhenThePolicyHasNoSources() {
        Policy policy = policy(List.of());
        when(policyEngine.runPolicy(eq(policy), any(), any()))
                .thenReturn(new PolicyRunHandle("r", new CompletableFuture<>()));

        runner.run(policy);

        ArgumentCaptor<PolicyInputs> inputs = ArgumentCaptor.forClass(PolicyInputs.class);
        verify(policyEngine).runPolicy(eq(policy), inputs.capture(), any());
        assertTrue(inputs.getValue().primary().isEmpty());
        // Ledger hygiene still runs: rows recorded for a generator policy's folder outputs
        // are pruned by its own sweeps rather than accumulating until the policy is deleted.
        verify(processedLedger).deleteUnseen(eq("p1"), anyLong());
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
        when(policyEngine.runPolicy(any(), any(), any()))
                .thenReturn(new PolicyRunHandle("r", new CompletableFuture<>()));

        runner.run(policy);

        verify(policyEngine, times(2)).runPolicy(eq(policy), any(), any());
    }

    @Test
    void feedsEachUnitsCompletionHookTheRunOutcome() throws Exception {
        InputSpec spec = InputSpec.folder("/in");
        Policy policy = policy(List.of(spec));
        AtomicBoolean outcome = new AtomicBoolean(false);
        ResolvedInput unit = new ResolvedInput(PolicyInputs.of(List.of()), outcome::set);
        when(folderSource.supports(spec)).thenReturn(true);
        when(folderSource.resolve(eq(spec), any())).thenReturn(List.of(unit));
        CompletableFuture<PolicyRun> completion = new CompletableFuture<>();
        when(policyEngine.runPolicy(any(), any(), any()))
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
        ResolvedInput unit = new ResolvedInput(PolicyInputs.of(List.of()), outcome::set);
        when(folderSource.supports(spec)).thenReturn(true);
        when(folderSource.resolve(eq(spec), any())).thenReturn(List.of(unit));
        CompletableFuture<PolicyRun> completion = new CompletableFuture<>();
        when(policyEngine.runPolicy(any(), any(), any()))
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
        when(policyEngine.runPolicy(any(), any(), any()))
                .thenReturn(new PolicyRunHandle("r", new CompletableFuture<>()));

        runner.run(policy, SweepKind.LIGHT);

        verify(policyEngine).runPolicy(eq(policy), any(), any());
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
        when(policyEngine.runPolicy(any(), any(), any()))
                .thenReturn(new PolicyRunHandle("r", new CompletableFuture<>()));

        runner.run(policy);

        verify(policyEngine).runPolicy(eq(policy), any(), any()); // healthy source still ran
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
        when(policyEngine.runPolicy(policy, inputs, PolicyProgressListener.NOOP))
                .thenReturn(handle);

        assertSame(handle, runner.runWith(policy, inputs, PolicyProgressListener.NOOP));
        verifyNoInteractions(folderSource);
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
                null,
                sourceIds,
                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                OutputSpec.inline());
    }

    private static Source sourceFrom(InputSpec spec) {
        return new Source(null, "src", spec.type(), spec.options(), true, "owner", null);
    }

    private static Source disabledSourceFrom(InputSpec spec) {
        return new Source(null, "src", spec.type(), spec.options(), false, "owner", null);
    }
}
