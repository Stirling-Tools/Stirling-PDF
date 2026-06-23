package stirling.software.saas.ai.controller;

import java.io.InputStream;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.ai.model.AiCreateSession;
import stirling.software.saas.ai.repository.AiCreateSessionRepository;
import stirling.software.saas.ai.service.AiCreateProxyService;
import stirling.software.saas.ai.service.AiCreateSessionService;
import stirling.software.saas.payg.cap.RequiresFeature;
import stirling.software.saas.payg.charge.ChargeContext;
import stirling.software.saas.payg.charge.JobChargeService;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.ProcessType;
import stirling.software.saas.util.AuthenticationUtils;

@RestController
@Profile("saas")
@RequestMapping("/api/v1/ai/create")
@Tag(name = "AI")
@Hidden
@RequiredArgsConstructor
@RequiresFeature(FeatureGate.AI_SUPPORT)
@Slf4j
public class AiCreateController {

    private final AiCreateSessionService sessionService;
    private final AiCreateProxyService proxyService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final UserRepository userRepository;
    private final JobChargeService jobChargeService;

    @PostMapping("/sessions")
    public ResponseEntity<CreateSessionResponse> createSession(
            @RequestBody CreateSessionRequest request) {
        if (request.prompt() == null || request.prompt().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Prompt is required");
        }
        AiCreateSession session =
                sessionService.createSession(
                        request.prompt(),
                        request.docType(),
                        request.templateId(),
                        request.templateTex(),
                        request.previewTex());
        log.info(
                "AI create session created sessionId={} userId={} docType={} templateId={}",
                session.getSessionId(),
                session.getUserId(),
                session.getDocType(),
                session.getTemplateId());
        chargeForCreate(session);
        return ResponseEntity.ok(new CreateSessionResponse(session.getSessionId()));
    }

    /**
     * Bill one document for a new AI Create session — creating a document is the charge point;
     * follow-up edits on the same session (outline / reprompt / draft / template / stream) carry no
     * charge. AI usage is billable, so a JWT (web) session counts the same as an API-key one.
     *
     * <p>Best-effort: a charge failure must not block the user's session. Entitlement is already
     * enforced upstream — this controller is {@code @RequiresFeature(AI_SUPPORT)}, so the
     * EntitlementGuard 402s a team with no AI allowance before we ever get here; this call only
     * does the accounting (free-grant draw + Stripe meter).
     */
    private void chargeForCreate(AiCreateSession session) {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            User user = AuthenticationUtils.getCurrentUser(auth, userRepository);
            if (user == null || user.getTeam() == null) {
                return;
            }
            JobSource source =
                    auth instanceof ApiKeyAuthenticationToken ? JobSource.API : JobSource.WEB;
            ChargeContext ctx =
                    new ChargeContext(
                            user.getId(),
                            user.getTeam().getId(),
                            source,
                            ProcessType.SINGLE_TOOL,
                            BillingCategory.AI);
            jobChargeService.chargeStandalone(ctx, 1);
        } catch (RuntimeException e) {
            log.warn(
                    "AI create session {} charge failed; session proceeds unbilled: {}",
                    session.getSessionId(),
                    e.getMessage());
        }
    }

    @DeleteMapping("/sessions/{sessionId}")
    public ResponseEntity<Void> deleteSession(@PathVariable String sessionId) {
        sessionService.deleteSessionForCurrentUser(sessionId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/sessions/{sessionId}")
    @Transactional(readOnly = true)
    public ResponseEntity<AiCreateSessionResponse> getSession(@PathVariable String sessionId) {
        AiCreateSession session = sessionService.getSessionForCurrentUser(sessionId);
        return ResponseEntity.ok(toResponse(session));
    }

    @GetMapping("/sessions")
    @Transactional(readOnly = true)
    public ResponseEntity<List<AiCreateSessionSummary>> listSessions(
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "10") int size,
            @RequestParam(name = "includeDrafts", defaultValue = "false") boolean includeDrafts) {
        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, Math.min(size, 50));
        List<AiCreateSessionRepository.AiCreateSessionSummaryProjection> sessions =
                sessionService.listSessionSummariesForCurrentUser(
                        org.springframework.data.domain.PageRequest.of(safePage, safeSize),
                        includeDrafts);
        return ResponseEntity.ok(sessions.stream().map(this::toSummary).toList());
    }

    @PostMapping("/sessions/{sessionId}/outline")
    public ResponseEntity<AiCreateSessionResponse> updateOutline(
            @PathVariable String sessionId, @RequestBody OutlineRequest request) {
        if (request.outlineText() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Outline text is required");
        }
        // Allow empty string to indicate "use AI-generated outline"
        String constraintsPayload = null;
        if (request.constraints() != null) {
            try {
                constraintsPayload = objectMapper.writeValueAsString(request.constraints());
            } catch (JsonProcessingException exc) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Invalid constraints payload", exc);
            }
        }
        AiCreateSession session =
                sessionService.updateOutline(
                        sessionId,
                        request.outlineText(),
                        request.outlineFilename(),
                        constraintsPayload);
        return ResponseEntity.ok(toResponse(session));
    }

    @PostMapping("/sessions/{sessionId}/reprompt")
    public ResponseEntity<AiCreateSessionResponse> reprompt(
            @PathVariable String sessionId, @RequestBody RepromptRequest request) {
        if (request.prompt() == null || request.prompt().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Prompt is required");
        }
        AiCreateSession session = sessionService.reprompt(sessionId, request.prompt());
        return ResponseEntity.ok(toResponse(session));
    }

    @PostMapping("/sessions/{sessionId}/draft")
    public ResponseEntity<AiCreateSessionResponse> updateDraft(
            @PathVariable String sessionId, @RequestBody DraftRequest request) {
        if (request.draftSections() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Draft sections are required");
        }
        // Allow empty list to indicate "use AI-generated sections"
        String payload;
        try {
            payload = objectMapper.writeValueAsString(request.draftSections());
        } catch (JsonProcessingException exc) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Invalid draft sections payload", exc);
        }
        AiCreateSession session = sessionService.updateDraftSections(sessionId, payload);
        return ResponseEntity.ok(toResponse(session));
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
                sessionService.updateTemplate(sessionId, request.docType(), request.templateId());
        return ResponseEntity.ok(toResponse(session));
    }

    @PostMapping("/sessions/{sessionId}/fields")
    public ResponseEntity<StreamingResponseBody> fillFields(
            @PathVariable String sessionId, HttpServletRequest request) {
        sessionService.getSessionForCurrentUser(sessionId);
        log.info("AI create fillFields sessionId={}", sessionId);
        return proxy("POST", "/api/create/sessions/" + sessionId + "/fields", request, false);
    }

    @GetMapping(
            value = "/sessions/{sessionId}/stream",
            produces = MediaType.TEXT_EVENT_STREAM_VALUE)
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
            if (acceptEventStream && !headers.containsHeader(HttpHeaders.CONTENT_TYPE)) {
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
                            outputStream.write("{\"error\":\"AI backend unavailable\"}".getBytes());
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            return new ResponseEntity<>(body, headers, HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    private void copyHeader(HttpResponse<?> response, HttpHeaders headers, String headerName) {
        response.headers()
                .firstValue(headerName)
                .ifPresent(value -> headers.set(headerName, value));
    }

    public record CreateSessionRequest(
            String prompt,
            String docType,
            String templateId,
            String templateTex,
            String previewTex) {}

    public record CreateSessionResponse(String sessionId) {}

    public record OutlineRequest(
            String outlineText, String outlineFilename, Map<String, Object> constraints) {}

    public record RepromptRequest(String prompt) {}

    public record DraftRequest(List<DraftSection> draftSections) {}

    public record DraftSection(String label, String value) {}

    public record TemplateRequest(String docType, String templateId) {}

    public record AiCreateSessionResponse(
            String sessionId,
            String userId,
            String docType,
            String templateId,
            String templateTex,
            String previewTex,
            String promptInitial,
            String promptLatest,
            String outlineText,
            String outlineFilename,
            boolean outlineApproved,
            Map<String, Object> outlineConstraints,
            List<DraftSection> draftSections,
            String polishedLatex,
            String pdfUrl,
            Instant createdAt,
            Instant updatedAt,
            String status) {}

    public record AiCreateSessionSummary(
            String sessionId,
            String docType,
            String templateId,
            String promptLatest,
            String promptInitial,
            String status,
            String pdfUrl,
            Instant createdAt,
            Instant updatedAt) {}

    private AiCreateSessionResponse toResponse(AiCreateSession session) {
        return new AiCreateSessionResponse(
                session.getSessionId(),
                session.getUserId(),
                session.getDocType(),
                session.getTemplateId(),
                session.getTemplateTex(),
                session.getPreviewTex(),
                session.getPromptInitial(),
                session.getPromptLatest(),
                session.getOutlineText(),
                session.getOutlineFilename(),
                session.isOutlineApproved(),
                parseOutlineConstraints(session.getOutlineConstraints()),
                parseDraftSections(session.getDraftSections()),
                session.getPolishedLatex(),
                session.getPdfUrl(),
                session.getCreatedAt(),
                session.getUpdatedAt(),
                session.getStatus() != null ? session.getStatus().name() : null);
    }

    private AiCreateSessionSummary toSummary(AiCreateSession session) {
        return new AiCreateSessionSummary(
                session.getSessionId(),
                session.getDocType(),
                session.getTemplateId(),
                session.getPromptLatest(),
                session.getPromptInitial(),
                session.getStatus() != null ? session.getStatus().name() : null,
                session.getPdfUrl(),
                session.getCreatedAt(),
                session.getUpdatedAt());
    }

    private AiCreateSessionSummary toSummary(
            AiCreateSessionRepository.AiCreateSessionSummaryProjection session) {
        return new AiCreateSessionSummary(
                session.getSessionId(),
                session.getDocType(),
                session.getTemplateId(),
                session.getPromptLatest(),
                session.getPromptInitial(),
                session.getStatus() != null ? session.getStatus().name() : null,
                session.getPdfUrl(),
                session.getCreatedAt(),
                session.getUpdatedAt());
    }

    private List<DraftSection> parseDraftSections(String payload) {
        if (payload == null || payload.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(
                    payload,
                    objectMapper
                            .getTypeFactory()
                            .constructCollectionType(List.class, DraftSection.class));
        } catch (JsonProcessingException exc) {
            log.warn("Failed to parse draft sections payload", exc);
            return null;
        }
    }

    private Map<String, Object> parseOutlineConstraints(String payload) {
        if (payload == null || payload.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(
                    payload,
                    objectMapper
                            .getTypeFactory()
                            .constructMapType(Map.class, String.class, Object.class));
        } catch (JsonProcessingException exc) {
            log.warn("Failed to parse outline constraints payload", exc);
            return null;
        }
    }
}
