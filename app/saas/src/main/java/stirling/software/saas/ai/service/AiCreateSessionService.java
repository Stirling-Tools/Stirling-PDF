package stirling.software.saas.ai.service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.UserServiceInterface;
import stirling.software.saas.ai.model.AiCreateSession;
import stirling.software.saas.ai.model.AiCreateSessionStatus;
import stirling.software.saas.ai.repository.AiCreateSessionRepository;
import stirling.software.saas.util.AuthenticationUtils;

@Service
@Profile("saas")
@RequiredArgsConstructor
@Slf4j
public class AiCreateSessionService {
    private static final String DEFAULT_USER_ID = "default_user";

    private final AiCreateSessionRepository repository;

    private final Optional<UserServiceInterface> userService;

    public AiCreateSession createSession(
            String prompt,
            String docType,
            String templateId,
            String templateTex,
            String previewTex) {
        String userId = resolveUserId();
        AiCreateSession session = new AiCreateSession();
        session.setSessionId(UUID.randomUUID().toString());
        session.setUserId(userId);
        session.setDocType(docType);
        session.setTemplateId(templateId);
        session.setTemplateTex(templateTex);
        session.setPreviewTex(previewTex);
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
        if (!userId.equals(session.getUserId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "AI session not found");
        }
        return session;
    }

    public AiCreateSession updateOutline(
            String sessionId,
            String outlineText,
            String outlineFilename,
            String outlineConstraints) {
        AiCreateSession session = getSessionForCurrentUser(sessionId);
        session.setOutlineText(outlineText);
        if (outlineFilename != null && !outlineFilename.isBlank()) {
            session.setOutlineFilename(outlineFilename);
        }
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
        session.setOutlineFilename(null);
        session.setOutlineApproved(false);
        session.setOutlineConstraints(null);
        session.setDraftSections(null);
        session.setPolishedLatex(null);
        session.setPdfUrl(null);
        session.setStatus(AiCreateSessionStatus.OUTLINE_PENDING);
        return repository.save(session);
    }

    public void deleteSessionForCurrentUser(String sessionId) {
        AiCreateSession session = getSessionForCurrentUser(sessionId);
        repository.delete(session);
    }

    public AiCreateSession applyInternalUpdate(
            String sessionId,
            String outlineText,
            String outlineFilename,
            Boolean outlineApproved,
            String outlineConstraints,
            String draftSections,
            String polishedLatex,
            String pdfUrl,
            String docType,
            String templateId,
            AiCreateSessionStatus status) {
        AiCreateSession session = getSession(sessionId);
        if (outlineText != null) {
            session.setOutlineText(outlineText);
        }
        if (outlineFilename != null) {
            session.setOutlineFilename(outlineFilename);
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
        if (pdfUrl != null) {
            session.setPdfUrl(pdfUrl);
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

    public List<AiCreateSession> listSessionsForCurrentUser() {
        String userId = resolveUserId();
        return repository.findByUserIdOrderByUpdatedAtDesc(userId);
    }

    public List<AiCreateSession> listSessionsForCurrentUser(Pageable pageable) {
        String userId = resolveUserId();
        return repository.findByUserIdOrderByUpdatedAtDesc(userId, pageable);
    }

    public List<AiCreateSession> listSessionsForCurrentUser(
            Pageable pageable, boolean includeDrafts) {
        String userId = resolveUserId();
        if (includeDrafts) {
            return repository.findByUserIdOrderByUpdatedAtDesc(userId, pageable);
        }
        return repository.findByUserIdAndPdfUrlIsNotNullOrderByUpdatedAtDesc(userId, pageable);
    }

    public List<AiCreateSessionRepository.AiCreateSessionSummaryProjection>
            listSessionSummariesForCurrentUser(Pageable pageable, boolean includeDrafts) {
        String userId = resolveUserId();
        if (includeDrafts) {
            return repository.findSummariesByUserIdOrderByUpdatedAtDesc(userId, pageable);
        }
        return repository.findSummariesByUserIdAndPdfUrlIsNotNullOrderByUpdatedAtDesc(
                userId, pageable);
    }

    public String resolveUserId() {
        String userId = resolveFromUserService();
        if (userId != null) {
            return userId;
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated()) {
            String authId = AuthenticationUtils.extractSupabaseId(authentication);
            if (authId != null && !authId.isBlank() && !"anonymousUser".equals(authId)) {
                return authId;
            }
        }

        String sessionScoped = resolveSessionScopedId();
        if (sessionScoped != null) {
            return sessionScoped;
        }

        return DEFAULT_USER_ID;
    }

    private String resolveFromUserService() {
        if (userService.isEmpty()) {
            return null;
        }
        try {
            String username = userService.get().getCurrentUsername();
            if (username != null && !username.isBlank() && !"anonymousUser".equals(username)) {
                return username;
            }
        } catch (Exception exc) {
            log.debug("Failed to resolve current username: {}", exc.getMessage());
        }
        return null;
    }

    private String resolveSessionScopedId() {
        ServletRequestAttributes attributes =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            return null;
        }
        HttpServletRequest request = attributes.getRequest();
        if (request == null) {
            return null;
        }
        HttpSession session = request.getSession(false);
        if (session == null) {
            return null;
        }
        return "session:" + session.getId();
    }
}
