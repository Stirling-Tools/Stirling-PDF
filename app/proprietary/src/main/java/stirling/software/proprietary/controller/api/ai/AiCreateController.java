package stirling.software.proprietary.controller.api.ai;

import java.io.InputStream;
import java.net.http.HttpResponse;
import java.util.Optional;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.ai.AiCreateSession;
import stirling.software.proprietary.service.ai.AiCreateProxyService;
import stirling.software.proprietary.service.ai.AiCreateSessionService;

@RestController
@RequestMapping("/api/v1/ai/create")
@RequiredArgsConstructor
@Slf4j
public class AiCreateController {

    private final AiCreateSessionService sessionService;
    private final AiCreateProxyService proxyService;
    private final ObjectMapper objectMapper;

    @PostMapping("/sessions")
    public ResponseEntity<CreateSessionResponse> createSession(
            @RequestBody CreateSessionRequest request) {
        if (request.prompt() == null || request.prompt().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Prompt is required");
        }
        AiCreateSession session =
                sessionService.createSession(request.prompt(), request.docType(), request.templateId());
        log.info(
                "AI create session created sessionId={} userId={} docType={} templateId={}",
                session.getSessionId(),
                session.getUserId(),
                session.getDocType(),
                session.getTemplateId());
        return ResponseEntity.ok(new CreateSessionResponse(session.getSessionId()));
    }

    @GetMapping("/sessions/{sessionId}")
    public ResponseEntity<AiCreateSessionResponse> getSession(
            @PathVariable String sessionId) {
        AiCreateSession session = sessionService.getSessionForCurrentUser(sessionId);
        return ResponseEntity.ok(AiCreateSessionResponse.from(session));
    }

    @PostMapping("/sessions/{sessionId}/outline")
    public ResponseEntity<AiCreateSessionResponse> updateOutline(
            @PathVariable String sessionId, @RequestBody OutlineRequest request) {
        if (request.outlineText() == null || request.outlineText().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Outline text is required");
        }
        String constraintsPayload = null;
        if (request.constraints() != null) {
            try {
                constraintsPayload = objectMapper.writeValueAsString(request.constraints());
            } catch (JsonProcessingException exc) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid constraints payload", exc);
            }
        }
        AiCreateSession session =
                sessionService.updateOutline(sessionId, request.outlineText(), constraintsPayload);
        return ResponseEntity.ok(AiCreateSessionResponse.from(session));
    }

    @PostMapping("/sessions/{sessionId}/reprompt")
    public ResponseEntity<AiCreateSessionResponse> reprompt(
            @PathVariable String sessionId, @RequestBody RepromptRequest request) {
        if (request.prompt() == null || request.prompt().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Prompt is required");
        }
        AiCreateSession session = sessionService.reprompt(sessionId, request.prompt());
        return ResponseEntity.ok(AiCreateSessionResponse.from(session));
    }

    @PostMapping("/sessions/{sessionId}/draft")
    public ResponseEntity<AiCreateSessionResponse> updateDraft(
            @PathVariable String sessionId, @RequestBody DraftRequest request) {
        if (request.draftSections() == null || request.draftSections().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Draft sections are required");
        }
        String payload;
        try {
            payload = objectMapper.writeValueAsString(request.draftSections());
        } catch (JsonProcessingException exc) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid draft sections payload", exc);
        }
        AiCreateSession session = sessionService.updateDraftSections(sessionId, payload);
        return ResponseEntity.ok(AiCreateSessionResponse.from(session));
    }

    @PostMapping("/sessions/{sessionId}/template")
    public ResponseEntity<AiCreateSessionResponse> updateTemplate(
            @PathVariable String sessionId, @RequestBody TemplateRequest request) {
        if ((request.docType() == null || request.docType().isBlank())
                && (request.templateId() == null || request.templateId().isBlank())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "docType or templateId is required");
        }
        AiCreateSession session =
                sessionService.updateTemplate(
                        sessionId, request.docType(), request.templateId());
        return ResponseEntity.ok(AiCreateSessionResponse.from(session));
    }

    @PostMapping("/sessions/{sessionId}/fields")
    public ResponseEntity<StreamingResponseBody> fillFields(
            @PathVariable String sessionId, HttpServletRequest request) {
        sessionService.getSessionForCurrentUser(sessionId);
        log.info("AI create fillFields sessionId={}", sessionId);
        return proxy("POST", "/api/create/sessions/" + sessionId + "/fields", request, false);
    }

    @GetMapping(value = "/sessions/{sessionId}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> stream(
            @PathVariable String sessionId, HttpServletRequest request) {
        sessionService.getSessionForCurrentUser(sessionId);
        return proxy("GET", "/api/create/sessions/" + sessionId + "/stream", request, true);
    }

    private ResponseEntity<StreamingResponseBody> proxy(
            String method, String path, HttpServletRequest request, boolean acceptEventStream) {
        try {
            HttpResponse<InputStream> response =
                    proxyService.forward(method, path, request, acceptEventStream);
            HttpHeaders headers = new HttpHeaders();
            copyHeader(response, headers, HttpHeaders.CONTENT_TYPE);
            copyHeader(response, headers, HttpHeaders.CACHE_CONTROL);
            copyHeader(response, headers, "X-Accel-Buffering");
            copyHeader(response, headers, HttpHeaders.CONTENT_DISPOSITION);
            copyHeader(response, headers, HttpHeaders.CONTENT_LENGTH);
            if (acceptEventStream && !headers.containsKey(HttpHeaders.CONTENT_TYPE)) {
                headers.set(HttpHeaders.CONTENT_TYPE, MediaType.TEXT_EVENT_STREAM_VALUE);
            }

            StreamingResponseBody body =
                    outputStream -> {
                        try (InputStream inputStream = response.body()) {
                            inputStream.transferTo(outputStream);
                        }
                    };
            HttpStatus status =
                    Optional.ofNullable(HttpStatus.resolve(response.statusCode()))
                            .orElse(HttpStatus.BAD_GATEWAY);
            return new ResponseEntity<>(body, headers, status);
        } catch (Exception exc) {
            log.error("AI create proxy failed path={}", path, exc);
            StreamingResponseBody body =
                    outputStream ->
                            outputStream.write(
                                    "{\"error\":\"AI backend unavailable\"}".getBytes());
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            return new ResponseEntity<>(body, headers, HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    private void copyHeader(
            HttpResponse<?> response, HttpHeaders headers, String headerName) {
        response.headers().firstValue(headerName).ifPresent(value -> headers.set(headerName, value));
    }

    public record CreateSessionRequest(String prompt, String docType, String templateId) {}

    public record CreateSessionResponse(String sessionId) {}

    public record OutlineRequest(String outlineText, Map<String, Object> constraints) {}

    public record RepromptRequest(String prompt) {}

    public record DraftRequest(List<DraftSection> draftSections) {}

    public record DraftSection(String label, String value) {}

    public record TemplateRequest(String docType, String templateId) {}

    public record AiCreateSessionResponse(
            String sessionId,
            String userId,
            String docType,
            String templateId,
            String promptInitial,
            String promptLatest,
            String outlineText,
            boolean outlineApproved,
            String outlineConstraints,
            String draftSections,
            String polishedLatex,
            String status) {
        public static AiCreateSessionResponse from(AiCreateSession session) {
            return new AiCreateSessionResponse(
                    session.getSessionId(),
                    session.getUserId(),
                    session.getDocType(),
                    session.getTemplateId(),
                    session.getPromptInitial(),
                    session.getPromptLatest(),
                    session.getOutlineText(),
                    session.isOutlineApproved(),
                    session.getOutlineConstraints(),
                    session.getDraftSections(),
                    session.getPolishedLatex(),
                    session.getStatus() != null ? session.getStatus().name() : null);
        }
    }
}
