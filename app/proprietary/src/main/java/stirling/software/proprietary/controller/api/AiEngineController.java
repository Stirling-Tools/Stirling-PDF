package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.inject.Named;
import jakarta.validation.Valid;
import jakarta.ws.rs.BeanParam;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.sse.OutboundSseEvent;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;

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
@ApplicationScoped
@jakarta.ws.rs.Path("/api/v1/ai")
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
    private final Instance<UserServiceInterface> userService;

    /**
     * SSE emitter timeout. Long enough to accommodate multi-gigabyte PDF workflows (OCR on a
     * 1000-page scan, splitting a huge PDF, etc.) without the emitter completing out from under the
     * executor. Configurable via {@code stirling.ai.streamTimeoutMs}.
     *
     * <p>TODO: Migration required - the JAX-RS SSE API has no per-emitter timeout equivalent to
     * Spring's {@code SseEmitter} constructor argument. Enforce this timeout against the background
     * orchestration task (e.g. a scheduled cancellation / Future.get with timeout) if a hard cap is
     * required; for now it only drives the timeout error frame's wording.
     */
    @ConfigProperty(name = "stirling.ai.streamTimeoutMs", defaultValue = "1800000")
    long streamTimeoutMs;

    @Inject
    public AiEngineController(
            AiEngineClient aiEngineClient,
            AiWorkflowService aiWorkflowService,
            ObjectMapper objectMapper,
            @Named("aiStreamExecutor") Executor aiStreamExecutor,
            TaskManager taskManager,
            JobOwnershipService jobOwnershipService,
            AiEngineEndpointResolver endpointResolver,
            Instance<UserServiceInterface> userService) {
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
        return userService.isResolvable() ? userService.get().getCurrentUsername() : null;
    }

    @GET
    @jakarta.ws.rs.Path("/health")
    @Operation(
            summary = "AI engine health check",
            description = "Returns the health status of the AI engine including configured models")
    public Response health() throws IOException {
        String response = aiEngineClient.get("/health", currentUserId());
        return Response.ok(response, MediaType.APPLICATION_JSON).build();
    }

    @POST
    @jakarta.ws.rs.Path("/orchestrate")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Operation(
            summary = "Run an AI workflow against a PDF",
            description =
                    "Accepts PDF uploads and a user message and returns an AI workflow result."
                            + " When the workflow produces files, they are registered with the job"
                            + " system and downloadable via GET /api/v1/general/files/{fileId}.")
    // TODO: Migration required - @BeanParam multipart binding depends on collaborator changes:
    // AiWorkflowRequest / AiWorkflowFileInput must have their multipart fields annotated with
    // @org.jboss.resteasy.reactive.RestForm and the nested AiWorkflowFileInput.fileInput must be
    // ported off Spring's MultipartFile to FileUpload + FileUploadMultipartFile.of(...). Until then
    // RESTEasy Reactive cannot populate this request from the multipart form body.
    public AiWorkflowResponse orchestrate(@Valid @BeanParam AiWorkflowRequest request)
            throws IOException {
        AiWorkflowResponse result = aiWorkflowService.orchestrate(request);
        registerFileResultAsJob(result);
        return result;
    }

    @POST
    @jakarta.ws.rs.Path("/orchestrate/stream")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @org.jboss.resteasy.reactive.RestStreamElementType(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Run an AI workflow with streaming progress",
            description =
                    "Accepts a PDF upload and a user message, returns SSE events with progress"
                            + " updates followed by the final AI workflow result")
    // TODO: Migration required - same @BeanParam multipart binding dependency as orchestrate():
    // AiWorkflowRequest / AiWorkflowFileInput need @RestForm fields and a FileUpload-based file
    // model before RESTEasy Reactive can bind this request from the multipart body.
    public void orchestrateStream(
            @Valid @BeanParam AiWorkflowRequest request,
            @Context Sse sse,
            @Context SseEventSink sink) {
        // The JAX-RS SseEventSink replaces Spring's SseEmitter. There is no onTimeout/onError
        // callback registration; sink.send(...) returns a CompletionStage and a disconnected
        // client surfaces as a failed send / closed sink, which the orchestration loop detects
        // via ClientDisconnectedException below.
        aiStreamExecutor.execute(() -> runOrchestrationStream(request, sse, sink));
    }

    private void runOrchestrationStream(AiWorkflowRequest request, Sse sse, SseEventSink sink) {
        AiWorkflowService.ProgressListener listener =
                new AiWorkflowService.ProgressListener() {
                    @Override
                    public void onProgress(AiWorkflowProgressEvent event) {
                        sendEvent(sse, sink, "progress", event);
                    }

                    @Override
                    public void onHeartbeat() {
                        // Forward upstream heartbeats so the SSE pipe stays visibly alive between
                        // real progress events; if the frontend has gone away, sendEvent throws,
                        // which propagates up through the stream consumer and closes our upstream
                        // engine connection so the engine can cancel its in-flight workflow.
                        sendEvent(sse, sink, "heartbeat", Map.of());
                    }
                };
        try {
            AiWorkflowResponse result = aiWorkflowService.orchestrate(request, listener);
            registerFileResultAsJob(result);
            sendEvent(sse, sink, "result", result);
            sink.close();
        } catch (ClientDisconnectedException e) {
            // The frontend gave up mid-stream. The exception unwinding through orchestrate()
            // already closed the upstream engine connection (engine sees disconnect and cancels).
            // The sink is already toast; nothing useful left to send.
            log.debug("Client disconnected mid-stream; aborting workflow", e);
        } catch (Exception e) {
            log.error("AI orchestration stream failed", e);
            // Emit an error frame for the frontend and then complete normally. The error
            // frame already conveys the failure to the client.
            sendEvent(sse, sink, "error", Map.of("message", e.getMessage()));
            if (!sink.isClosed()) {
                sink.close();
            }
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

    private void sendEvent(Sse sse, SseEventSink sink, String name, Object data) {
        if (sink.isClosed()) {
            throw new ClientDisconnectedException("Client disconnected from SSE stream", null);
        }
        OutboundSseEvent event =
                sse.newEventBuilder()
                        .name(name)
                        .mediaType(MediaType.APPLICATION_JSON_TYPE)
                        .data(data)
                        .build();
        try {
            // CompletionStage join surfaces a delivery failure (client gone) synchronously so the
            // streaming pipeline unwinds: callers higher up close the upstream engine connection,
            // which lets the engine cancel its in-flight workflow. Without this, the engine would
            // keep producing (and billing for) tokens whose results nobody is reading.
            sink.send(event).toCompletableFuture().join();
        } catch (RuntimeException e) {
            throw new ClientDisconnectedException("Client disconnected from SSE stream", e);
        }
    }

    /**
     * Thrown by {@link #sendEvent} when the SSE sink's underlying connection is gone. Treated as a
     * signal to abort the workflow, not as an error to report.
     */
    private static final class ClientDisconnectedException extends RuntimeException {
        ClientDisconnectedException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    @POST
    @jakarta.ws.rs.Path("/pdf/edit")
    @Consumes(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Generate a PDF edit plan",
            description =
                    "Sends a user message to the PDF edit agent which returns a structured plan"
                            + " of tool operations to perform")
    public Response pdfEdit(String requestBody) throws IOException {
        JsonNode parsed = parseJson(requestBody);
        if (!parsed.isObject()) {
            throw new WebApplicationException(
                    "Request body must be a JSON object", Response.Status.BAD_REQUEST);
        }
        String forwardedBody = withEnabledEndpoints((ObjectNode) parsed);
        String response = aiEngineClient.post("/api/v1/pdf/edit", forwardedBody, currentUserId());
        return Response.ok(response, MediaType.APPLICATION_JSON).build();
    }

    private JsonNode parseJson(String body) {
        try {
            return objectMapper.readValue(body, JsonNode.class);
        } catch (JacksonException e) {
            throw new WebApplicationException(
                    "Request body is not valid JSON", Response.Status.BAD_REQUEST);
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
