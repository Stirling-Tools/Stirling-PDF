package stirling.software.saas.ai.controller;

import java.util.List;
import java.util.Map;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.ai.model.AiCreateSession;
import stirling.software.saas.ai.model.AiCreateSessionStatus;
import stirling.software.saas.ai.service.AiCreateSessionService;
import stirling.software.saas.payg.cap.RequiresFeature;
import stirling.software.saas.payg.model.FeatureGate;

@RestController
@Profile("saas")
@RequestMapping("/api/v1/ai/create/internal")
@Tag(name = "AI")
@Hidden
@RequiredArgsConstructor
@RequiresFeature(FeatureGate.AI_SUPPORT)
@Slf4j
public class AiCreateInternalController {

    private final AiCreateSessionService sessionService;
    // Inlined: Stirling's parent build uses Jackson 3 (tools.jackson), no Jackson 2 ObjectMapper
    // bean in the context. Stateless usage, so a fresh instance per controller is fine.
    private final ObjectMapper objectMapper = new ObjectMapper();

    @GetMapping("/sessions/{sessionId}")
    public ResponseEntity<AiCreateController.AiCreateSessionResponse> getSession(
            @PathVariable String sessionId) {
        log.info("AI create internal getSession sessionId={}", sessionId);
        AiCreateSession session = sessionService.getSession(sessionId);
        return ResponseEntity.ok(toResponse(session));
    }

    @PostMapping("/sessions/{sessionId}/update")
    public ResponseEntity<AiCreateController.AiCreateSessionResponse> updateSession(
            @PathVariable String sessionId, @RequestBody UpdateSessionRequest request) {
        log.info("AI create internal updateSession sessionId={}", sessionId);
        String outlineConstraintsPayload = null;
        if (request.outlineConstraints() != null) {
            try {
                outlineConstraintsPayload =
                        objectMapper.writeValueAsString(request.outlineConstraints());
            } catch (JsonProcessingException exc) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Invalid outline constraints payload", exc);
            }
        }
        String draftSectionsPayload = null;
        if (request.draftSections() != null) {
            try {
                draftSectionsPayload = objectMapper.writeValueAsString(request.draftSections());
            } catch (JsonProcessingException exc) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Invalid draft sections payload", exc);
            }
        }
        AiCreateSession session =
                sessionService.applyInternalUpdate(
                        sessionId,
                        request.outlineText(),
                        request.outlineFilename(),
                        request.outlineApproved(),
                        outlineConstraintsPayload,
                        draftSectionsPayload,
                        request.polishedLatex(),
                        request.pdfUrl(),
                        request.docType(),
                        request.templateId(),
                        request.status());
        return ResponseEntity.ok(toResponse(session));
    }

    public record UpdateSessionRequest(
            String outlineText,
            String outlineFilename,
            Boolean outlineApproved,
            Map<String, Object> outlineConstraints,
            List<AiCreateController.DraftSection> draftSections,
            String polishedLatex,
            String pdfUrl,
            String docType,
            String templateId,
            AiCreateSessionStatus status) {}

    private AiCreateController.AiCreateSessionResponse toResponse(AiCreateSession session) {
        return new AiCreateController.AiCreateSessionResponse(
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

    private List<AiCreateController.DraftSection> parseDraftSections(String payload) {
        if (payload == null || payload.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(
                    payload,
                    objectMapper
                            .getTypeFactory()
                            .constructCollectionType(
                                    List.class, AiCreateController.DraftSection.class));
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
