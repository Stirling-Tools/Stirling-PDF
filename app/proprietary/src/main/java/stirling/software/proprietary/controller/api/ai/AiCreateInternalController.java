package stirling.software.proprietary.controller.api.ai;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.ai.AiCreateSession;
import stirling.software.proprietary.model.ai.AiCreateSessionStatus;
import stirling.software.proprietary.service.ai.AiCreateSessionService;

@RestController
@RequestMapping("/api/v1/ai/create/internal")
@RequiredArgsConstructor
@Slf4j
public class AiCreateInternalController {

    private final AiCreateSessionService sessionService;

    @GetMapping("/sessions/{sessionId}")
    public ResponseEntity<AiCreateController.AiCreateSessionResponse> getSession(
            @PathVariable String sessionId) {
        log.info("AI create internal getSession sessionId={}", sessionId);
        AiCreateSession session = sessionService.getSession(sessionId);
        return ResponseEntity.ok(AiCreateController.AiCreateSessionResponse.from(session));
    }

    @PostMapping("/sessions/{sessionId}/update")
    public ResponseEntity<AiCreateController.AiCreateSessionResponse> updateSession(
            @PathVariable String sessionId, @RequestBody UpdateSessionRequest request) {
        log.info("AI create internal updateSession sessionId={}", sessionId);
        AiCreateSession session =
                sessionService.applyInternalUpdate(
                        sessionId,
                        request.outlineText(),
                        request.outlineApproved(),
                        request.outlineConstraints(),
                        request.draftSections(),
                        request.polishedLatex(),
                        request.docType(),
                        request.templateId(),
                        request.status());
        return ResponseEntity.ok(AiCreateController.AiCreateSessionResponse.from(session));
    }

    public record UpdateSessionRequest(
            String outlineText,
            Boolean outlineApproved,
            String outlineConstraints,
            String draftSections,
            String polishedLatex,
            String docType,
            String templateId,
            AiCreateSessionStatus status) {}
}
