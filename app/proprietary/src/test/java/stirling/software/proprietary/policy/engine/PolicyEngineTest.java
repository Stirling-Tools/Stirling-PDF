package stirling.software.proprietary.policy.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.InputStream;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.MDC;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.HttpClientErrorException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.FileStorage.StoredFile;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.ResourceMonitor;
import stirling.software.common.service.TaskManager;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.PolicyRunStatus;
import stirling.software.proprietary.policy.output.InlineOutputSink;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;

import tools.jackson.databind.json.JsonMapper;

/**
 * Tests for {@link PolicyEngine}: async submission runs the pipeline on a virtual thread, registers
 * outputs and progress with {@link TaskManager}, and surfaces terminal state via {@link
 * PolicyRunRegistry}. The step executor and inline sink are real (with mocked collaborators) so the
 * full run path is exercised.
 */
@ExtendWith(MockitoExtension.class)
class PolicyEngineTest {

    private static final String ROTATE = "/api/v1/general/rotate-pdf";
    private static final String COMPRESS = "/api/v1/misc/compress-pdf";

    @Mock private InternalApiClient internalApiClient;
    @Mock private ToolMetadataService toolMetadataService;
    @Mock private TaskManager taskManager;
    @Mock private FileStorage fileStorage;
    @Mock private JobOwnershipService jobOwnershipService;
    @Mock private ResourceMonitor resourceMonitor;
    @Mock private JobQueue jobQueue;

    @TempDir Path tempDir;

    private PolicyRunRegistry registry;
    private PolicyEngine engine;

    @BeforeEach
    void setUp() {
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        props.getSystem().getTempFileManagement().setPrefix("policy-engine-test-");
        TempFileManager tempFileManager = new TempFileManager(new TempFileRegistry(), props);
        PolicyExecutor executor =
                new PolicyExecutor(
                        internalApiClient,
                        toolMetadataService,
                        tempFileManager,
                        JsonMapper.builder().build());
        registry = new PolicyRunRegistry(new ApplicationProperties());
        InlineOutputSink sink = new InlineOutputSink(fileStorage);
        engine =
                new PolicyEngine(
                        executor,
                        taskManager,
                        registry,
                        fileStorage,
                        jobOwnershipService,
                        List.of(sink),
                        resourceMonitor,
                        jobQueue);

        // Identity scoping: the run id is the generated UUID unchanged. Lenient because the
        // resume/cancel tests do not submit a run.
        lenient()
                .when(jobOwnershipService.createScopedJobKey(anyString()))
                .thenAnswer(inv -> inv.getArgument(0));
        // Default to running immediately; the queueing test overrides this.
        lenient().when(resourceMonitor.shouldQueueJob(anyInt())).thenReturn(false);
    }

    @Test
    void submitRunsPipelineToCompletionAndRegistersOutputs() throws Exception {
        when(toolMetadataService.isMultiInput(anyString())).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(anyString())).thenReturn(false);
        stubEndpoint(ROTATE, pdf("rotated", "rotated.pdf"));
        stubEndpoint(COMPRESS, pdf("compressed", "compressed.pdf"));
        int[] counter = {0};
        when(fileStorage.storeInputStream(any(InputStream.class), anyString()))
                .thenAnswer(
                        inv -> {
                            InputStream is = inv.getArgument(0);
                            long size = is.readAllBytes().length;
                            return new StoredFile("file-" + ++counter[0], size);
                        });

        PolicyRunHandle handle =
                engine.submit(
                        definition(
                                new PipelineStep(ROTATE, Map.of()),
                                new PipelineStep(COMPRESS, Map.of())),
                        PolicyInputs.of(List.of(pdf("input", "input.pdf"))),
                        PolicyProgressListener.NOOP);

        // The completion future resolves with the final run state, no polling needed.
        String runId = handle.runId();
        PolicyRun run = handle.completion().get(10, TimeUnit.SECONDS);
        assertEquals(PolicyRunStatus.COMPLETED, run.getStatus());
        assertEquals(1, run.getOutputs().size());
        assertEquals("compressed.pdf", run.getOutputs().get(0).getFileName());

        // The run self-registers its results and completion with the job system.
        verify(taskManager).createTask(runId);
        verify(taskManager).setMultipleFileResults(eq(runId), any());
        verify(taskManager).setComplete(runId);
        // Progress notes were written for each step.
        verify(taskManager, atLeastOnce()).addNote(eq(runId), anyString());
    }

    @Test
    void submitFailsRunWhenAToolErrors() throws Exception {
        when(toolMetadataService.isMultiInput(ROTATE)).thenReturn(false);
        when(internalApiClient.post(eq(ROTATE), any())).thenThrow(new RuntimeException("boom"));

        PolicyRunHandle handle =
                engine.submit(
                        definition(new PipelineStep(ROTATE, Map.of())),
                        PolicyInputs.of(List.of(pdf("input", "input.pdf"))),
                        PolicyProgressListener.NOOP);

        String runId = handle.runId();
        PolicyRun run = handle.completion().get(10, TimeUnit.SECONDS);
        assertEquals(PolicyRunStatus.FAILED, run.getStatus());
        verify(taskManager).setError(eq(runId), anyString());
        verify(taskManager, never()).setComplete(runId);
    }

    @Test
    void runBlockedByUsageLimit_surfacesErrorCodeAndSubscribed() throws Exception {
        // A downstream tool call gets a 402 entitlement block. The run fails, but its errorCode +
        // subscribed are taken from the 402 body so the client can pop the right usage-limit modal
        // (the policy 402 happens server-side, out of reach of the apiClient interceptor).
        when(toolMetadataService.isMultiInput(ROTATE)).thenReturn(false);
        String body = "{\"error\":\"PAYG_LIMIT_REACHED\",\"subscribed\":true}";
        when(internalApiClient.post(eq(ROTATE), any()))
                .thenThrow(
                        HttpClientErrorException.create(
                                HttpStatus.PAYMENT_REQUIRED,
                                "Payment Required",
                                HttpHeaders.EMPTY,
                                body.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                                java.nio.charset.StandardCharsets.UTF_8));

        PolicyRun run =
                engine.submit(
                                definition(new PipelineStep(ROTATE, Map.of())),
                                PolicyInputs.of(List.of(pdf("input", "input.pdf"))),
                                PolicyProgressListener.NOOP)
                        .completion()
                        .get(10, TimeUnit.SECONDS);

        assertEquals(PolicyRunStatus.FAILED, run.getStatus());
        assertEquals("PAYG_LIMIT_REACHED", run.getErrorCode());
        assertEquals(Boolean.TRUE, run.getErrorSubscribed());
    }

    @Test
    void runPolicyExecutesThePolicysPipeline() throws Exception {
        when(toolMetadataService.isMultiInput(anyString())).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(anyString())).thenReturn(false);
        stubEndpoint(ROTATE, pdf("rotated", "rotated.pdf"));
        int[] counter = {0};
        when(fileStorage.storeInputStream(any(InputStream.class), anyString()))
                .thenAnswer(
                        inv -> {
                            InputStream is = inv.getArgument(0);
                            return new StoredFile("file-" + ++counter[0], is.readAllBytes().length);
                        });

        Policy policy =
                new Policy(
                        "p1",
                        "rotate",
                        "owner",
                        true,
                        null,
                        List.of(new PipelineStep(ROTATE, Map.of())),
                        OutputSpec.inline());

        PolicyRunHandle handle =
                engine.runPolicy(
                        policy,
                        PolicyInputs.of(List.of(pdf("input", "input.pdf"))),
                        PolicyProgressListener.NOOP);

        PolicyRun run = handle.completion().get(10, TimeUnit.SECONDS);
        assertEquals(PolicyRunStatus.COMPLETED, run.getStatus());
        verify(internalApiClient).post(eq(ROTATE), any());
    }

    @Test
    void runPolicyDispatchesToolCallsAsTheOwner() throws Exception {
        // Billing-attribution regression: the pipeline runs on a background worker thread, but the
        // policy owner must be propagated as the audit principal so InternalApiClient (and thus
        // PAYG) attributes each tool call to the owner — not the INTERNAL_API_USER fallback.
        when(toolMetadataService.isMultiInput(anyString())).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(anyString())).thenReturn(false);
        int[] counter = {0};
        when(fileStorage.storeInputStream(any(InputStream.class), anyString()))
                .thenAnswer(
                        inv ->
                                new StoredFile(
                                        "file-" + ++counter[0],
                                        ((InputStream) inv.getArgument(0)).readAllBytes().length));

        String[] principalAtDispatch = {"<none>"};
        when(internalApiClient.post(eq(ROTATE), any()))
                .thenAnswer(
                        inv -> {
                            principalAtDispatch[0] = MDC.get("auditPrincipal");
                            return ResponseEntity.ok(pdf("rotated", "rotated.pdf"));
                        });

        Policy policy =
                new Policy(
                        "p1",
                        "rotate",
                        "alice",
                        true,
                        null,
                        List.of(new PipelineStep(ROTATE, Map.of())),
                        OutputSpec.inline());

        engine.runPolicy(
                        policy,
                        PolicyInputs.of(List.of(pdf("input", "input.pdf"))),
                        PolicyProgressListener.NOOP)
                .completion()
                .get(10, TimeUnit.SECONDS);

        assertEquals("alice", principalAtDispatch[0]);
    }

    @Test
    void adHocRunDispatchesToolCallsAsTheSubmittingUser() throws Exception {
        // Ad-hoc runs (no stored policy) bill whoever kicked them off; the principal is captured on
        // the request thread (here simulated via MDC) and re-established on the worker thread.
        when(toolMetadataService.isMultiInput(anyString())).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(anyString())).thenReturn(false);
        int[] counter = {0};
        when(fileStorage.storeInputStream(any(InputStream.class), anyString()))
                .thenAnswer(
                        inv ->
                                new StoredFile(
                                        "file-" + ++counter[0],
                                        ((InputStream) inv.getArgument(0)).readAllBytes().length));

        String[] principalAtDispatch = {"<none>"};
        when(internalApiClient.post(eq(ROTATE), any()))
                .thenAnswer(
                        inv -> {
                            principalAtDispatch[0] = MDC.get("auditPrincipal");
                            return ResponseEntity.ok(pdf("rotated", "rotated.pdf"));
                        });

        MDC.put("auditPrincipal", "bob"); // the request thread's audit principal
        try {
            engine.submit(
                            definition(new PipelineStep(ROTATE, Map.of())),
                            PolicyInputs.of(List.of(pdf("input", "input.pdf"))),
                            PolicyProgressListener.NOOP)
                    .completion()
                    .get(10, TimeUnit.SECONDS);
        } finally {
            MDC.remove("auditPrincipal");
        }

        assertEquals("bob", principalAtDispatch[0]);
    }

    @Test
    void runIsQueuedUnderResourcePressure() {
        when(resourceMonitor.shouldQueueJob(anyInt())).thenReturn(true);
        // Returning an already-completed future keeps the run parked: the queued work (which would
        // start the run) is never executed by this mock, so it stays PENDING.
        doReturn(CompletableFuture.completedFuture(null))
                .when(jobQueue)
                .queueJob(anyString(), anyInt(), any(), anyLong());

        PolicyRunHandle handle =
                engine.submit(
                        definition(new PipelineStep(ROTATE, Map.of())),
                        PolicyInputs.of(List.of(pdf("input", "input.pdf"))),
                        PolicyProgressListener.NOOP);

        verify(jobQueue).queueJob(eq(handle.runId()), anyInt(), any(), anyLong());
        assertEquals(PolicyRunStatus.PENDING, registry.get(handle.runId()).getStatus());
    }

    @Test
    void runRejectedWhenQueueFullCarriesTransientErrorCode() {
        when(resourceMonitor.shouldQueueJob(anyInt())).thenReturn(true);
        // Admission rejected (queue full): the queued future completes exceptionally.
        CompletableFuture<Object> rejected = new CompletableFuture<>();
        rejected.completeExceptionally(
                new RuntimeException("Job queue full, please try again later"));
        doReturn(rejected).when(jobQueue).queueJob(anyString(), anyInt(), any(), anyLong());

        PolicyRunHandle handle =
                engine.submit(
                        definition(new PipelineStep(ROTATE, Map.of())),
                        PolicyInputs.of(List.of(pdf("input", "input.pdf"))),
                        PolicyProgressListener.NOOP);

        PolicyRun run = registry.get(handle.runId());
        assertEquals(PolicyRunStatus.FAILED, run.getStatus());
        // Tagged transient so the client backs off and retries instead of hard-failing.
        assertEquals("POLICY_QUEUE_FULL", run.getErrorCode());
    }

    @Test
    void resumeIsNotYetImplemented() {
        assertThrows(UnsupportedOperationException.class, () -> engine.resume("any", List.of()));
    }

    @Test
    void cancelUnknownRunReturnsFalse() {
        assertFalse(engine.cancel("does-not-exist"));
    }

    // --- helpers ---

    private static PipelineDefinition definition(PipelineStep... steps) {
        return new PipelineDefinition("test", List.of(steps), OutputSpec.inline());
    }

    private void stubEndpoint(String endpoint, Resource body) {
        when(internalApiClient.post(eq(endpoint), any())).thenReturn(ResponseEntity.ok(body));
    }

    private static ByteArrayResource pdf(String content, String filename) {
        return new ByteArrayResource(content.getBytes()) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
    }
}
