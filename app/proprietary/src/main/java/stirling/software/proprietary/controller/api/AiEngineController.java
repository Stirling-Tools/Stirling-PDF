package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.Executor;

import org.springframework.beans.factory.annotation.Qualifier;
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

import stirling.software.proprietary.model.api.ai.AiWorkflowRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowResponse;
import stirling.software.proprietary.service.AiEngineClient;
import stirling.software.proprietary.service.AiWorkflowService;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

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

    public AiEngineController(
            AiEngineClient aiEngineClient,
            AiWorkflowService aiWorkflowService,
            ObjectMapper objectMapper,
            @Qualifier("aiStreamExecutor") Executor aiStreamExecutor) {
        this.aiEngineClient = aiEngineClient;
        this.aiWorkflowService = aiWorkflowService;
        this.objectMapper = objectMapper;
        this.aiStreamExecutor = aiStreamExecutor;
    }

    @GetMapping("/health")
    @Operation(
            summary = "AI engine health check",
            description = "Returns the health status of the AI engine including configured models")
    public ResponseEntity<String> health() throws IOException {
        String response = aiEngineClient.get("/health");
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(response);
    }

    @PostMapping(value = "/orchestrate", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Run an AI workflow against a PDF",
            description =
                    "Accepts a PDF upload and a user message and returns an AI workflow result")
    public ResponseEntity<AiWorkflowResponse> orchestrate(
            @Valid @ModelAttribute AiWorkflowRequest request) throws IOException {
        return ResponseEntity.ok(aiWorkflowService.orchestrate(request));
    }

    @PostMapping(value = "/orchestrate/stream", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Run an AI workflow with streaming progress",
            description =
                    "Accepts a PDF upload and a user message, returns SSE events with progress"
                            + " updates followed by the final AI workflow result")
    public SseEmitter orchestrateStream(@Valid @ModelAttribute AiWorkflowRequest request) {
        SseEmitter emitter = new SseEmitter(180_000L);

        emitter.onTimeout(
                () -> {
                    log.warn("SSE emitter timed out for AI orchestration stream");
                    emitter.complete();
                });
        emitter.onError(e -> log.warn("SSE emitter error for AI orchestration stream", e));

        aiStreamExecutor.execute(
                () -> {
                    try {
                        AiWorkflowResponse result =
                                aiWorkflowService.orchestrate(
                                        request,
                                        progress -> {
                                            try {
                                                emitter.send(
                                                        SseEmitter.event()
                                                                .name("progress")
                                                                .data(
                                                                        progress,
                                                                        MediaType
                                                                                .APPLICATION_JSON));
                                            } catch (IOException e) {
                                                log.debug(
                                                        "Failed to send progress event"
                                                                + " (client may have"
                                                                + " disconnected)",
                                                        e);
                                            }
                                        });
                        emitter.send(
                                SseEmitter.event()
                                        .name("result")
                                        .data(result, MediaType.APPLICATION_JSON));
                        emitter.complete();
                    } catch (Exception e) {
                        log.error("AI orchestration stream failed", e);
                        try {
                            emitter.send(
                                    SseEmitter.event()
                                            .name("error")
                                            .data(
                                                    Map.of("message", e.getMessage()),
                                                    MediaType.APPLICATION_JSON));
                        } catch (IOException ignored) {
                            // Client already disconnected
                        }
                        emitter.completeWithError(e);
                    }
                });

        return emitter;
    }

    @PostMapping(value = "/pdf/edit", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Generate a PDF edit plan",
            description =
                    "Sends a user message to the PDF edit agent which returns a structured plan"
                            + " of tool operations to perform")
    public ResponseEntity<String> pdfEdit(@RequestBody String requestBody) throws IOException {
        validateJson(requestBody);
        String response = aiEngineClient.post("/api/v1/pdf/edit", requestBody);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(response);
    }

    private void validateJson(String body) {
        try {
            objectMapper.readValue(body, JsonNode.class);
        } catch (JacksonException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Request body is not valid JSON");
        }
    }
}
