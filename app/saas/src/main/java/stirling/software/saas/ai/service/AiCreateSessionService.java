package stirling.software.saas.ai.service;

import java.util.List;
import java.util.UUID;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.security.Authentication;
import stirling.software.common.security.SecurityContextHolder;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.saas.ai.model.AiCreateSession;
import stirling.software.saas.ai.model.AiCreateSessionStatus;
import stirling.software.saas.ai.repository.AiCreateSessionRepository;
import stirling.software.saas.util.AuthenticationUtils;

@ApplicationScoped
@IfBuildProfile("saas")
@RequiredArgsConstructor
@Slf4j
public class AiCreateSessionService {
    private static final String DEFAULT_USER_ID = "default_user";

    private final AiCreateSessionRepository repository;

    // Optional dependency: Quarkus CDI does not auto-inject Optional<T>, so use Instance<T> and
    // resolve it where used (isResolvable()/get()), mirroring the former Optional semantics.
    private final Instance<UserServiceInterface> userService;

    // TODO: Migration required - Spring MVC RequestContextHolder/ServletRequestAttributes replaced
    // with a CDI-injected request-scoped HttpServletRequest (quarkus-undertow). Wrapped in Instance
    // so resolution outside an active HTTP request (e.g. scheduled/startup contexts) is a safe
    // no-op.
    @jakarta.inject.Inject Instance<HttpServletRequest> currentRequest;

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
                .findByIdOptional(sessionId)
                .orElseThrow(
                        () ->
                                new WebApplicationException(
                                        "AI session not found", Response.Status.NOT_FOUND));
    }

    public AiCreateSession getSessionForCurrentUser(String sessionId) {
        AiCreateSession session = getSession(sessionId);
        String userId = resolveUserId();
        if (!userId.equals(session.getUserId())) {
            throw new WebApplicationException("AI session not found", Response.Status.NOT_FOUND);
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

    public List<AiCreateSession> listSessionsForCurrentUser(int page, int size) {
        String userId = resolveUserId();
        return repository.findByUserIdOrderByUpdatedAtDesc(userId, page, size);
    }

    public List<AiCreateSession> listSessionsForCurrentUser(
            int page, int size, boolean includeDrafts) {
        String userId = resolveUserId();
        if (includeDrafts) {
            return repository.findByUserIdOrderByUpdatedAtDesc(userId, page, size);
        }
        return repository.findByUserIdAndPdfUrlIsNotNullOrderByUpdatedAtDesc(userId, page, size);
    }

    public List<AiCreateSessionRepository.AiCreateSessionSummaryProjection>
            listSessionSummariesForCurrentUser(int page, int size, boolean includeDrafts) {
        String userId = resolveUserId();
        if (includeDrafts) {
            return repository.findSummariesByUserIdOrderByUpdatedAtDesc(userId, page, size);
        }
        return repository.findSummariesByUserIdAndPdfUrlIsNotNullOrderByUpdatedAtDesc(
                userId, page, size);
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
        if (!userService.isResolvable()) {
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
        if (currentRequest == null || !currentRequest.isResolvable()) {
            return null;
        }
        HttpServletRequest request;
        try {
            request = currentRequest.get();
        } catch (RuntimeException exc) {
            // No active request context (e.g. invoked outside an HTTP request).
            return null;
        }
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
