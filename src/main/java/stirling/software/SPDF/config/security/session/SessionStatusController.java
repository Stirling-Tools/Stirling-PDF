package stirling.software.SPDF.config.security.session;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.security.UserUtils;

@Controller
@Slf4j
public class SessionStatusController {

    @Qualifier("loginEnabled")
    private boolean loginEnabled;

    @Autowired private SessionPersistentRegistry sessionPersistentRegistry;

    @Autowired private CustomHttpSessionListener customHttpSessionListener;

    // list all sessions from authentication user, return String redirect userSession.html
    @GetMapping("/userSession")
    public String getUserSessions(
            HttpServletRequest request, Model model, Authentication authentication) {
        if ((authentication == null || !authentication.isAuthenticated()) && loginEnabled) {
            return "redirect:/login";
        }
        HttpSession session = request.getSession(false);
        if (session != null) {
            String principalName = null;
            if (authentication != null && authentication.isAuthenticated()) {
                Object principal = authentication.getPrincipal();
                principalName = UserUtils.getUsernameFromPrincipal(principal);
                if (principalName == null) {
                    return "redirect:/login";
                }
            } else {
                principalName = "anonymousUser";
            }

            boolean isSessionValid =
                    sessionPersistentRegistry.getAllSessions(principalName, false).stream()
                            .allMatch(
                                    sessionEntity ->
                                            sessionEntity.getSessionId().equals(session.getId()));

            if (isSessionValid) {
                return "redirect:/";
            }
            // Get all sessions for the user
            List<SessionInformation> sessionList =
                    sessionPersistentRegistry.getAllSessions(principalName, false).stream()
                            .filter(
                                    sessionEntity ->
                                            !sessionEntity.getSessionId().equals(session.getId()))
                            .toList();

            model.addAttribute("sessionList", sessionList);
            return "userSession";
        }
        return "redirect:/login";
    }

    @GetMapping("/userSession/invalidate/{sessionId}")
    public String invalidateUserSession(
            HttpServletRequest request,
            Authentication authentication,
            @PathVariable String sessionId)
            throws ServletException {
        if (authentication == null || !authentication.isAuthenticated()) {
            return "redirect:/login";
        }
        Object principal = authentication.getPrincipal();
        String principalName = UserUtils.getUsernameFromPrincipal(principal);
        if (principalName == null) {
            return "redirect:/login";
        }
        boolean isOwner =
                sessionPersistentRegistry.getAllSessions(principalName, false).stream()
                        .anyMatch(session -> session.getSessionId().equals(sessionId));
        if (isOwner) {
            customHttpSessionListener.expireSession(sessionId, false);
            sessionPersistentRegistry.registerNewSession(
                    request.getRequestedSessionId().split(".node0")[0], principal);
            // return "redirect:/userSession?messageType=sessionInvalidated"
            return "redirect:/userSession";
        } else {
            return "redirect:/login";
        }
    }

    @GetMapping("/session/invalidate/{sessionId}")
    public String invalidateSession(
            HttpServletRequest request,
            Authentication authentication,
            @PathVariable String sessionId) {
        // ist ROLE_ADMIN oder session inhaber
        if (authentication == null || !authentication.isAuthenticated()) {
            return "redirect:/login";
        }
        Object principal = authentication.getPrincipal();
        String principalName = UserUtils.getUsernameFromPrincipal(principal);
        if (principalName == null) {
            return "redirect:/login";
        }
        boolean isAdmin =
                authentication.getAuthorities().stream()
                        .anyMatch(role -> "ROLE_ADMIN".equals(role.getAuthority()));

        boolean isOwner =
                sessionPersistentRegistry.getAllSessions(principalName, false).stream()
                        .anyMatch(session -> session.getSessionId().equals(sessionId));
        if (isAdmin || isOwner) {
            customHttpSessionListener.expireSession(sessionId, isAdmin);
            return "redirect:/adminSettings?messageType=sessionInvalidated";
        } else {
            return "redirect:/login";
        }
    }
}
