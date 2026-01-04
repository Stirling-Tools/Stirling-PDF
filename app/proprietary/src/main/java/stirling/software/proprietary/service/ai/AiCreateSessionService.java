package stirling.software.proprietary.service.ai;

import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.model.ai.AiCreateSession;
import stirling.software.proprietary.model.ai.AiCreateSessionStatus;
import stirling.software.proprietary.repository.AiCreateSessionRepository;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiCreateSessionService {
    private static final String DEFAULT_USER_ID = "default_user";

    private final AiCreateSessionRepository repository;

    private final Optional<UserServiceInterface> userService;

    public AiCreateSession createSession(String prompt, String docType, String templateId) {
        String userId = resolveUserId();
        AiCreateSession session = new AiCreateSession();
        session.setSessionId(UUID.randomUUID().toString());
        session.setUserId(userId);
        session.setDocType(docType);
        session.setTemplateId(templateId);
        session.setPromptInitial(prompt);
        session.setPromptLatest(prompt);
        session.setOutlineApproved(false);
        session.setStatus(AiCreateSessionStatus.OUTLINE_PENDING);
        return repository.save(session);
    }

    public AiCreateSession getSession(String sessionId) {
        return repository
                .findById(sessionId)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND, "AI session not found"));
    }

    public AiCreateSession getSessionForCurrentUser(String sessionId) {
        AiCreateSession session = getSession(sessionId);
        String userId = resolveUserId();
        if (!DEFAULT_USER_ID.equals(userId) && !userId.equals(session.getUserId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "AI session not found");
        }
        return session;
    }

    public AiCreateSession updateOutline(String sessionId, String outlineText, String outlineConstraints) {
        AiCreateSession session = getSessionForCurrentUser(sessionId);
        session.setOutlineText(outlineText);
        session.setOutlineApproved(true);
        if (outlineConstraints != null) {
            session.setOutlineConstraints(outlineConstraints);
        }
        session.setStatus(AiCreateSessionStatus.OUTLINE_APPROVED);
        return repository.save(session);
    }

    public AiCreateSession updateDraftSections(String sessionId, String draftSections) {
        AiCreateSession session = getSessionForCurrentUser(sessionId);
        session.setDraftSections(draftSections);
        session.setStatus(AiCreateSessionStatus.DRAFT_READY);
        return repository.save(session);
    }

    public AiCreateSession updateTemplate(String sessionId, String docType, String templateId) {
        AiCreateSession session = getSessionForCurrentUser(sessionId);
        if (docType != null && !docType.isBlank()) {
            session.setDocType(docType);
        }
        if (templateId != null && !templateId.isBlank()) {
            session.setTemplateId(templateId);
        }
        return repository.save(session);
    }

    public AiCreateSession reprompt(String sessionId, String prompt) {
        AiCreateSession session = getSessionForCurrentUser(sessionId);
        session.setPromptLatest(prompt);
        session.setOutlineText(null);
        session.setOutlineApproved(false);
        session.setOutlineConstraints(null);
        session.setDraftSections(null);
        session.setPolishedLatex(null);
        session.setStatus(AiCreateSessionStatus.OUTLINE_PENDING);
        return repository.save(session);
    }

    public AiCreateSession applyInternalUpdate(
            String sessionId,
            String outlineText,
            Boolean outlineApproved,
            String outlineConstraints,
            String draftSections,
            String polishedLatex,
            String docType,
            String templateId,
            AiCreateSessionStatus status) {
        AiCreateSession session = getSession(sessionId);
        if (outlineText != null) {
            session.setOutlineText(outlineText);
        }
        if (outlineApproved != null) {
            session.setOutlineApproved(outlineApproved);
        }
        if (outlineConstraints != null) {
            session.setOutlineConstraints(outlineConstraints);
        }
        if (draftSections != null) {
            session.setDraftSections(draftSections);
        }
        if (polishedLatex != null) {
            session.setPolishedLatex(polishedLatex);
        }
        if (docType != null) {
            session.setDocType(docType);
        }
        if (templateId != null) {
            session.setTemplateId(templateId);
        }
        if (status != null) {
            session.setStatus(status);
        }
        return repository.save(session);
    }

    public String resolveUserId() {
        if (userService == null || userService.isEmpty()) {
            return DEFAULT_USER_ID;
        }
        try {
            String username = userService.get().getCurrentUsername();
            if (username != null
                    && !username.isBlank()
                    && !"anonymousUser".equals(username)) {
                return username;
            }
        } catch (Exception exc) {
            log.debug("Failed to resolve current username: {}", exc.getMessage());
        }
        return DEFAULT_USER_ID;
    }
}
