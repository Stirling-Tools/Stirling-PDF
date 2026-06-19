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

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
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

import jakarta.ws.rs.core.Response;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.io.Resource;
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
 *
 * <p>MIGRATION (Spring -> Quarkus): {@link InternalApiClient} now returns a {@link Response} (was
 * ResponseEntity) and file parts are the {@link Resource} shim (was the old Spring core Resource).
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
        when(internalApiClient.post(eq(endpoint), any())).thenReturn(Response.ok(body).build());
    }

    private static Resource pdf(String content, String filename) {
        return new ByteArrayBackedResource(content.getBytes(), filename);
    }

    /**
     * In-memory {@link Resource} with a stable filename and repeatable reads (replaces the Spring
     * {@code ByteArrayResource} used pre-migration).
     */
    private static final class ByteArrayBackedResource implements Resource {
        private final byte[] bytes;
        private final String filename;

        ByteArrayBackedResource(byte[] bytes, String filename) {
            this.bytes = bytes;
            this.filename = filename;
        }

        @Override
        public InputStream getInputStream() {
            return new ByteArrayInputStream(bytes);
        }

        @Override
        public boolean exists() {
            return true;
        }

        @Override
        public String getFilename() {
            return filename;
        }

        @Override
        public long contentLength() {
            return bytes.length;
        }

        @Override
        public File getFile() throws IOException {
            throw new IOException("not file-backed");
        }
    }
}
