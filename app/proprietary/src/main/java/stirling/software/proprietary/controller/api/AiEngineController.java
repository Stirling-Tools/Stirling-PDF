package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
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

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.job.ResultFile;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.service.TaskManager;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.model.api.ai.AiEngineStatus;
import stirling.software.proprietary.model.api.ai.AiWorkflowProgressEvent;
import stirling.software.proprietary.model.api.ai.AiWorkflowRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowResponse;
import stirling.software.proprietary.model.api.ai.AiWorkflowResultFile;
import stirling.software.proprietary.service.AiEngineClient;
import stirling.software.proprietary.service.AiEngineEndpointResolver;
import stirling.software.proprietary.service.AiEngineRouter;
import stirling.software.proprietary.service.AiFeatureGate;
import stirling.software.proprietary.service.AiWorkflowService;
import stirling.software.proprietary.service.CloudStatusProbe;

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

    /** Per probe, connect included, so a hung engine cannot hold a request for minutes. */
    static final Duration PROBE_TIMEOUT = Duration.ofSeconds(5);

    private final AiEngineClient aiEngineClient;
    private final AiWorkflowService aiWorkflowService;
    private final ObjectMapper objectMapper;
    private final Executor aiStreamExecutor;
    private final TaskManager taskManager;
    private final JobOwnershipService jobOwnershipService;
    private final AiEngineEndpointResolver endpointResolver;
    private final AiFeatureGate aiFeatureGate;
    private final UserServiceInterface userService;
    private final ApplicationProperties applicationProperties;
    private final AiEngineRouter aiEngineRouter;
    private final CloudStatusProbe cloudStatusProbe;

    /**
     * SSE emitter timeout (ms), long enough for multi-gigabyte PDF workflows without completing out
     * from under the executor. Derived from {@code aiEngine.streamTimeoutSeconds}.
     */
    private final long streamTimeoutMs;

    public AiEngineController(
            AiEngineClient aiEngineClient,
            AiWorkflowService aiWorkflowService,
            ObjectMapper objectMapper,
            @Qualifier("aiStreamExecutor") Executor aiStreamExecutor,
            TaskManager taskManager,
            JobOwnershipService jobOwnershipService,
            AiEngineEndpointResolver endpointResolver,
            AiFeatureGate aiFeatureGate,
            ApplicationProperties applicationProperties,
            AiEngineRouter aiEngineRouter,
            CloudStatusProbe cloudStatusProbe,
            @Autowired(required = false) UserServiceInterface userService) {
        this.aiEngineClient = aiEngineClient;
        this.aiWorkflowService = aiWorkflowService;
        this.objectMapper = objectMapper;
        this.aiStreamExecutor = aiStreamExecutor;
        this.taskManager = taskManager;
        this.jobOwnershipService = jobOwnershipService;
        this.endpointResolver = endpointResolver;
        this.aiFeatureGate = aiFeatureGate;
        this.userService = userService;
        this.applicationProperties = applicationProperties;
        this.aiEngineRouter = aiEngineRouter;
        this.cloudStatusProbe = cloudStatusProbe;
        this.streamTimeoutMs =
                applicationProperties.getAiEngine().getStreamTimeoutSeconds() * 1000L;
    }

    private String currentUserId() {
        return userService != null ? userService.getCurrentUsername() : null;
    }

    @GetMapping("/health")
    @Operation(
            summary = "AI engine health check",
            description = "Returns the health status of the AI engine including configured models")
    public ResponseEntity<String> health() throws IOException {
        String response = aiEngineClient.get("/health", currentUserId(), PROBE_TIMEOUT);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(response);
    }

    /**
     * Also probes a secret-gated route: the engine's {@code /health} skips the shared-secret check,
     * so it stays green while real calls get 401. Admin-only, as each call makes 2-4 requests.
     */
    @GetMapping("/status")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(
            summary = "AI engine status",
            description =
                    "Reachability, round-trip time, the models in use, and whether the engine"
                            + " accepted this server's shared secret.")
    public AiEngineStatus status() {
        ApplicationProperties.AiEngine config = applicationProperties.getAiEngine();
        if (!config.isEnabled()) {
            return AiEngineStatus.builder().enabled(false).reachable(false).build();
        }

        AiEngineStatus.AiEngineStatusBuilder status = AiEngineStatus.builder().enabled(true);
        String userId = currentUserId();

        // Asked first: a cloud outage or sharing being off explains any failure that follows.
        if (aiEngineRouter.isCloudMode()) {
            boolean cloudUp = cloudStatusProbe.isUp();
            status.cloudUp(cloudUp);
            if (!cloudUp) {
                return status.reachable(false)
                        .cloudSharingEnabled(null)
                        .error("Stirling Cloud is not responding.")
                        .build();
            }
            Boolean sharing = probeCloudSharing(userId);
            status.cloudSharingEnabled(sharing);
            if (Boolean.FALSE.equals(sharing)) {
                return status.reachable(false)
                        .error("Stirling Cloud AI sharing is switched off for linked servers.")
                        .build();
            }
        }

        long startedAt = System.nanoTime();
        String health;
        try {
            health = aiEngineClient.get("/health", userId, PROBE_TIMEOUT);
        } catch (IOException | RuntimeException e) {
            return status.reachable(false).error(describeFailure(e)).build();
        }
        status.reachable(true)
                .latencyMs(Duration.ofNanos(System.nanoTime() - startedAt).toMillis());

        try {
            JsonNode body = objectMapper.readTree(health);
            status.smartModel(textOrNull(body, "smartModel"))
                    .fastModel(textOrNull(body, "fastModel"));
        } catch (JacksonException e) {
            log.debug("AI engine health returned a body we could not parse", e);
        }

        status.authenticated(probeAuthentication(userId, status));
        return status.build();
    }

    /**
     * @return false only when the gateway said so; null when it could not be asked
     */
    private Boolean probeCloudSharing(String userId) {
        try {
            JsonNode body =
                    objectMapper.readTree(aiEngineClient.get("/status", userId, PROBE_TIMEOUT));
            JsonNode enabled = body.path("sharingEnabled");
            return enabled.isBoolean() ? enabled.asBoolean() : null;
        } catch (IOException | RuntimeException e) {
            log.debug("Cloud AI sharing probe failed", e);
            return null;
        }
    }

    /**
     * @return true if accepted, false if rejected, null if the probe failed for another reason
     */
    private Boolean probeAuthentication(
            String userId, AiEngineStatus.AiEngineStatusBuilder status) {
        try {
            aiEngineClient.get("/api/v1/agents/capabilities", userId, PROBE_TIMEOUT);
            return true;
        } catch (AiEngineClient.EngineRejectedCredentials e) {
            status.error(
                    aiEngineRouter.isCloudMode()
                            ? "Stirling Cloud rejected this server's link credential."
                            : "The engine rejected this server's shared secret.");
            return false;
        } catch (ResponseStatusException e) {
            int code = e.getStatusCode().value();
            String reason = e.getReason();
            // Engine 5xx arrive as 502, so its fail-closed 503 survives only in the message.
            if (code == HttpStatus.BAD_GATEWAY.value()
                    && reason != null
                    && reason.endsWith("503")) {
                status.error("The engine requires a shared secret but none is configured on it.");
                return false;
            }
            log.debug("AI engine capabilities probe returned {}", code);
            return null;
        } catch (IOException | RuntimeException e) {
            log.debug("AI engine capabilities probe failed", e);
            return null;
        }
    }

    private static String textOrNull(JsonNode body, String field) {
        JsonNode value = body.path(field);
        return value.isTextual() ? value.asText() : null;
    }

    private static String describeFailure(Exception e) {
        if (e instanceof ResponseStatusException rse && rse.getReason() != null) {
            return rse.getReason();
        }
        return e.getMessage();
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
        aiFeatureGate.requireConversationalWorkflow();
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
        aiFeatureGate.requireConversationalWorkflow();
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
        // Same gate as /orchestrate: edit agent is a model call on the same conversational surface.
        aiFeatureGate.requireConversationalWorkflow();
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
