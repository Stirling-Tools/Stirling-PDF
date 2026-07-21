package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.ResultFile;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.service.TaskManager;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.model.api.ai.AiWorkflowProgressEvent;
import stirling.software.proprietary.model.api.ai.AiWorkflowRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowResponse;
import stirling.software.proprietary.model.api.ai.AiWorkflowResultFile;
import stirling.software.proprietary.service.AiEngineClient;
import stirling.software.proprietary.service.AiEngineEndpointResolver;
import stirling.software.proprietary.service.AiWorkflowService;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Slf4j
@RestController
@RequestMapping("/api/v1/ai")
@Hidden
@Tag(name = "AI Engine", description = "Endpoints for AI-powered PDF workflows")
public class AiEngineController {

    private final AiEngineClient aiEngineClient;
    private final AiWorkflowService aiWorkflowService;
    private final ObjectMapper objectMapper;
    private final Executor aiStreamExecutor;
    private final TaskManager taskManager;
    private final JobOwnershipService jobOwnershipService;
    private final AiEngineEndpointResolver endpointResolver;
    private final UserServiceInterface userService;

    /**
     * SSE emitter timeout. Long enough to accommodate multi-gigabyte PDF workflows (OCR on a
     * 1000-page scan, splitting a huge PDF, etc.) without the emitter completing out from under the
     * executor. Configurable via {@code stirling.ai.streamTimeoutMs}.
     */
    @Value("${stirling.ai.streamTimeoutMs:1800000}")
    private long streamTimeoutMs;

    public AiEngineController(
            AiEngineClient aiEngineClient,
            AiWorkflowService aiWorkflowService,
            ObjectMapper objectMapper,
            @Qualifier("aiStreamExecutor") Executor aiStreamExecutor,
            TaskManager taskManager,
            JobOwnershipService jobOwnershipService,
            AiEngineEndpointResolver endpointResolver,
            @Autowired(required = false) UserServiceInterface userService) {
        this.aiEngineClient = aiEngineClient;
        this.aiWorkflowService = aiWorkflowService;
        this.objectMapper = objectMapper;
        this.aiStreamExecutor = aiStreamExecutor;
        this.taskManager = taskManager;
        this.jobOwnershipService = jobOwnershipService;
        this.endpointResolver = endpointResolver;
        this.userService = userService;
    }

    private String currentUserId() {
        return userService != null ? userService.getCurrentUsername() : null;
    }

    @GetMapping("/health")
    @Operation(
            summary = "AI engine health check",
            description = "Returns the health status of the AI engine including configured models")
    public ResponseEntity<String> health() throws IOException {
        String response = aiEngineClient.get("/health", currentUserId());
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(response);
    }

    @PostMapping(value = "/orchestrate", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Run an AI workflow against a PDF",
            description =
                    "Accepts PDF uploads and a user message and returns an AI workflow result."
                            + " When the workflow produces files, they are registered with the job"
                            + " system and downloadable via GET /api/v1/general/files/{fileId}.")
    public AiWorkflowResponse orchestrate(@Valid @ModelAttribute AiWorkflowRequest request)
            throws IOException {
        AiWorkflowResponse result = aiWorkflowService.orchestrate(request);
        registerFileResultAsJob(result);
        return result;
    }

    @PostMapping(value = "/orchestrate/stream", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Run an AI workflow with streaming progress",
            description =
                    "Accepts a PDF upload and a user message, returns SSE events with progress"
                            + " updates followed by the final AI workflow result")
    public SseEmitter orchestrateStream(@Valid @ModelAttribute AiWorkflowRequest request) {
        SseEmitter emitter = new SseEmitter(streamTimeoutMs);

        emitter.onTimeout(
                () -> {
                    // Emit an explicit error frame so the frontend reports a timeout rather than
                    // silently seeing the stream end without a result.
                    log.warn(
                            "SSE emitter timed out for AI orchestration stream after {} ms",
                            streamTimeoutMs);
                    sendEvent(
                            emitter,
                            "error",
                            Map.of(
                                    "message",
                                    "AI workflow timed out after "
                                            + (streamTimeoutMs / 1000)
                                            + " seconds"));
                    emitter.complete();
                });
        emitter.onError(e -> log.warn("SSE emitter error for AI orchestration stream", e));

        aiStreamExecutor.execute(() -> runOrchestrationStream(request, emitter));

        return emitter;
    }

    private void runOrchestrationStream(AiWorkflowRequest request, SseEmitter emitter) {
        AiWorkflowService.ProgressListener listener =
                new AiWorkflowService.ProgressListener() {
                    @Override
                    public void onProgress(AiWorkflowProgressEvent event) {
                        sendEvent(emitter, "progress", event);
                    }

                    @Override
                    public void onHeartbeat() {
                        // Forward upstream heartbeats so the SSE pipe stays visibly alive between
                        // real progress events; if the frontend has gone away, sendEvent throws,
                        // which propagates up through the stream consumer and closes our upstream
                        // engine connection so the engine can cancel its in-flight workflow.
                        sendEvent(emitter, "heartbeat", Map.of());
                    }
                };
        try {
            AiWorkflowResponse result = aiWorkflowService.orchestrate(request, listener);
            registerFileResultAsJob(result);
            sendEvent(emitter, "result", result);
            emitter.complete();
        } catch (ClientDisconnectedException e) {
            // The frontend gave up mid-stream. The exception unwinding through orchestrate()
            // already closed the upstream engine connection (engine sees disconnect and cancels).
            // The emitter is already toast; nothing useful left to send.
            log.debug("Client disconnected mid-stream; aborting workflow", e);
        } catch (Exception e) {
            log.error("AI orchestration stream failed", e);
            // Emit an error frame for the frontend and then complete normally. Using
            // completeWithError here as well would double-complete the emitter - the error
            // frame already conveys the failure to the client.
            sendEvent(emitter, "error", Map.of("message", e.getMessage()));
            emitter.complete();
        }
    }

    /**
     * Register any file results produced by the workflow with {@link TaskManager} so they are
     * downloadable via {@code GET /api/v1/general/files/{fileId}}. Uses {@code
     * setMultipleFileResults} so the fileIds we registered earlier are not mangled by TaskManager's
     * ZIP auto-extract path.
     */
    private void registerFileResultAsJob(AiWorkflowResponse result) {
        List<AiWorkflowResultFile> files = result.getResultFiles();
        if (files == null || files.isEmpty()) {
            return;
        }
        // Scope the job key to the current user so the download endpoint's ownership check
        // passes when security is enabled. NoOpJobOwnershipService returns the UUID unchanged
        // when security is off.
        String jobKey =
                jobOwnershipService.createScopedJobKey(java.util.UUID.randomUUID().toString());
        taskManager.createTask(jobKey);
        List<ResultFile> jobFiles =
                files.stream()
                        .map(
                                f ->
                                        ResultFile.builder()
                                                .fileId(f.getFileId())
                                                .fileName(f.getFileName())
                                                .contentType(f.getContentType())
                                                .build())
                        .toList();
        taskManager.setMultipleFileResults(jobKey, jobFiles);
        taskManager.setComplete(jobKey);
    }

    private void sendEvent(SseEmitter emitter, String name, Object data) {
        try {
            emitter.send(SseEmitter.event().name(name).data(data, MediaType.APPLICATION_JSON));
        } catch (IOException e) {
            // Surface the disconnect so the streaming pipeline unwinds: callers higher up close
            // the upstream engine connection, which lets the engine cancel its in-flight workflow.
            // Without this, the engine would keep producing (and billing for) tokens whose results
            // nobody is reading.
            throw new ClientDisconnectedException("Client disconnected from SSE stream", e);
        }
    }

    /**
     * Thrown by {@link #sendEvent} when the SSE emitter's underlying connection is gone. Treated as
     * a signal to abort the workflow, not as an error to report.
     */
    private static final class ClientDisconnectedException extends RuntimeException {
        ClientDisconnectedException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    @PostMapping(value = "/pdf/edit", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Generate a PDF edit plan",
            description =
                    "Sends a user message to the PDF edit agent which returns a structured plan"
                            + " of tool operations to perform")
    public ResponseEntity<String> pdfEdit(@RequestBody String requestBody) throws IOException {
        JsonNode parsed = parseJson(requestBody);
        if (!parsed.isObject()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Request body must be a JSON object");
        }
        String forwardedBody = withEnabledEndpoints((ObjectNode) parsed);
        String response = aiEngineClient.post("/api/v1/pdf/edit", forwardedBody, currentUserId());
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(response);
    }

    private JsonNode parseJson(String body) {
        try {
            return objectMapper.readValue(body, JsonNode.class);
        } catch (JacksonException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Request body is not valid JSON");
        }
    }

    /**
     * Always overwrite {@code enabled_endpoints} with the server's view of which endpoints are
     * usable. The engine must not trust a client-supplied list - the gate is owned by the Java
     * EndpointConfiguration. Values are full URL paths (e.g. {@code /api/v1/misc/compress-pdf})
     * that the engine matches against its {@code ToolEndpoint} enum, silently dropping any it
     * doesn't recognise (which lets the two sides drift in either direction without breaking).
     */
    private String withEnabledEndpoints(ObjectNode body) {
        ArrayNode enabled = objectMapper.createArrayNode();
        endpointResolver.getEnabledEndpointUrls().forEach(enabled::add);
        body.set("enabled_endpoints", enabled);
        return body.toString();
    }
}
