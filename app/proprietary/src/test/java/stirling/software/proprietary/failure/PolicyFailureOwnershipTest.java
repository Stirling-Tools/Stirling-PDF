package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.MDC;
import org.springframework.core.io.ByteArrayResource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.ResourceMonitor;
import stirling.software.common.service.TaskManager;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.proprietary.policy.asset.InProcessPolicyAssetStore;
import stirling.software.proprietary.policy.asset.PolicyAssetResolver;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.engine.PolicyEngine;
import stirling.software.proprietary.policy.engine.PolicyExecutor;
import stirling.software.proprietary.policy.engine.PolicyRunRegistry;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.output.InlineOutputSink;
import stirling.software.proprietary.policy.output.PolicyOutputResolver;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;

import tools.jackson.databind.json.JsonMapper;

/**
 * What a reader is offered on a real recorded row, every collaborator being the real one. Both
 * directions are asserted: offered to the wrong reader is either a dead button or a leaked
 * document.
 */
@ExtendWith(MockitoExtension.class)
class PolicyFailureOwnershipTest {

    private static final String ROTATE = "/api/v1/general/rotate-pdf";
    private static final Long TEAM = 3L;

    @Mock private InternalApiClient internalApiClient;
    @Mock private ToolMetadataService toolMetadataService;
    @Mock private TaskManager taskManager;
    @Mock private FileStorage fileStorage;
    @Mock private JobOwnershipService jobOwnershipService;
    @Mock private ResourceMonitor resourceMonitor;
    @Mock private JobQueue jobQueue;
    @Mock private PolicyStore policyStore;
    @Mock private PolicyManagementAuthority authority;
    @Mock private UserServiceInterface userService;

    @TempDir Path tempDir;

    private PolicyEngine engine;
    private FileRunEventService service;

    @BeforeEach
    void setUp() {
        ApplicationProperties props = new ApplicationProperties();
        props.getSecurity().setEnableLogin(true);
        props.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        props.getSystem().getTempFileManagement().setPrefix("failure-ownership-test-");

        FileRunEventStore store = new FileRunEventStore(new InMemoryFileRunEventRepository());
        service =
                new FileRunEventService(
                        store,
                        new FailureActionRegistry(
                                List.of(new AcknowledgeAction(store), new DismissAction(store))),
                        authority,
                        userService,
                        props);

        PolicyFailureRecorder recorder =
                new PolicyFailureRecorder(
                        new FailureClassifier(JsonMapper.builder().build()), store, policyStore);
        PolicyExecutor executor =
                new PolicyExecutor(
                        internalApiClient,
                        toolMetadataService,
                        new TempFileManager(new TempFileRegistry(), props),
                        JsonMapper.builder().build());
        engine =
                new PolicyEngine(
                        executor,
                        taskManager,
                        new PolicyRunRegistry(new ApplicationProperties()),
                        recorder,
                        fileStorage,
                        jobOwnershipService,
                        List.of(new InlineOutputSink(fileStorage)),
                        new PolicyOutputResolver(new InProcessSourceStore()),
                        resourceMonitor,
                        jobQueue,
                        new PolicyAssetResolver(new InProcessPolicyAssetStore()));

        lenient()
                .when(jobOwnershipService.createScopedJobKey(anyString()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        lenient().when(resourceMonitor.shouldQueueJob(anyInt())).thenReturn(false);
        lenient().when(toolMetadataService.isMultiInput(anyString())).thenReturn(false);
        // The team is resolved from the policy, so the recorded row lands in the reader's team.
        lenient().when(policyStore.get(anyString())).thenReturn(Optional.of(sharedPolicy()));
        lenient().when(authority.currentUserTeamId()).thenReturn(TEAM);
    }

    /** Alice's policy, shared with her team. Bob is a member of it and does not own it. */
    private static Policy sharedPolicy() {
        return new Policy(
                "p1",
                "rotate",
                "alice",
                true,
                List.of(),
                List.of(new PipelineStep(ROTATE, Map.of())),
                OutputSpec.inline(),
                TEAM);
    }

    /** Fails the policy's single tool step as {@code triggeredBy} (null = sweep). */
    private void runAndFail(String triggeredBy, String sourceId, String fileIdentity)
            throws Exception {
        when(internalApiClient.post(eq(ROTATE), any())).thenThrow(new RuntimeException("boom"));
        if (triggeredBy != null) {
            MDC.put("auditPrincipal", triggeredBy);
        }
        try {
            engine.runPolicy(
                            sharedPolicy(),
                            PolicyInputs.of(List.of(pdf())),
                            PolicyProgressListener.NOOP,
                            sourceId,
                            fileIdentity)
                    .completion()
                    .get(10, TimeUnit.SECONDS);
        } finally {
            MDC.remove("auditPrincipal");
        }
    }

    private static ByteArrayResource pdf() {
        return new ByteArrayResource("input".getBytes()) {
            @Override
            public String getFilename() {
                return "input.pdf";
            }
        };
    }

    /**
     * Lenient because a leader's scope and an UNOWNED check both answer without asking who reads,
     * so whether the name is consulted is the behaviour under test.
     */
    private FileRunEvent asMember(String reader) {
        lenient().when(userService.getCurrentUsername()).thenReturn(reader);
        lenient().when(authority.canEditPolicies()).thenReturn(false);
        List<FileRunEvent> visible = service.list(null, false, null, 10);
        return visible.isEmpty() ? null : visible.getFirst();
    }

    /** Read as a team leader, who reviews the whole team's incidents. See {@link #asMember}. */
    private FileRunEvent asReviewer(String reader) {
        lenient().when(userService.getCurrentUsername()).thenReturn(reader);
        lenient().when(authority.canEditPolicies()).thenReturn(true);
        return service.list(null, false, null, 10).getFirst();
    }

    private List<FailureActionId> offeredTo(FileRunEvent event) {
        return service.availableActions(event).stream()
                .map(FileRunEventService.AvailableAction::id)
                .toList();
    }

    @Nested
    @DisplayName("a non-owner runs a shared policy on their own upload")
    class AttendedByANonOwner {

        @Test
        void theTriggeringUserHoldsItAndIsOfferedTheDocument() throws Exception {
            runAndFail("bob", null, "bob-doc-1");

            FileRunEvent mine = asMember("bob");
            assertThat(service.ownershipOf(mine)).isEqualTo(Ownership.MINE);
            assertThat(offeredTo(mine))
                    .as("he is holding the document, so opening it is his to do")
                    .contains(FailureActionId.VIEW_FILE);
            assertThat(service.availableActions(mine))
                    .filteredOn(action -> action.id() == FailureActionId.VIEW_FILE)
                    .singleElement()
                    .satisfies(action -> assertThat(action.enabled()).isTrue());
        }

        @Test
        void thePolicyOwnerIsNotHandedADocumentSheNeverTouched() throws Exception {
            runAndFail("bob", null, "bob-doc-1");

            // She owns the policy and pays for the run, and still has no copy of Bob's file.
            FileRunEvent theirs = asReviewer("alice");
            assertThat(service.ownershipOf(theirs)).isEqualTo(Ownership.THEIRS);
            assertThat(offeredTo(theirs)).doesNotContain(FailureActionId.VIEW_FILE);
        }

        @Test
        void theReviewerIsStillOfferedWhatReviewingNeeds() throws Exception {
            runAndFail("bob", null, "bob-doc-1");

            // Not her document, still her team's incident.
            assertThat(offeredTo(asReviewer("alice")))
                    .contains(FailureActionId.VIEW_IN_PROCESSOR, FailureActionId.DISMISS);
        }
    }

    @Nested
    @DisplayName("an unattended sweep pulls a file from a source")
    class UnattendedSweep {

        @Test
        void theRowIsOwnedByNobodySoTheReviewerInheritsTheOwnerActions() throws Exception {
            runAndFail(null, "src-watched-folder", "file-hash-1");

            FileRunEvent unattended = asReviewer("alice");
            assertThat(service.ownershipOf(unattended)).isEqualTo(Ownership.UNOWNED);
            // No browser holds this document, so the offer is stated and disabled, not dropped.
            assertThat(offeredTo(unattended)).contains(FailureActionId.VIEW_FILE);
            assertThat(service.availableActions(unattended))
                    .filteredOn(action -> action.id() == FailureActionId.VIEW_FILE)
                    .singleElement()
                    .satisfies(
                            action -> {
                                assertThat(action.enabled()).isFalse();
                                assertThat(action.disabledReasonKey())
                                        .isEqualTo("portal.failures.disabled.unattended");
                            });
        }

        @Test
        void thePolicyOwnerDoesNotInheritItAsHerOwn() throws Exception {
            // Being billed for the sweep must not become ownership: she gets these as reviewer
            // only.
            runAndFail(null, "src-watched-folder", "file-hash-1");

            assertThat(service.ownershipOf(asReviewer("alice"))).isNotEqualTo(Ownership.MINE);
        }
    }
}
