package stirling.software.SPDF.config.anonymus.session;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.interfaces.SessionsInterface;
import stirling.software.SPDF.config.security.UserUtils;
import stirling.software.SPDF.config.security.session.CustomHttpSessionListener;
import stirling.software.SPDF.config.security.session.SessionPersistentRegistry;

@Controller
@Slf4j
public class SessionStatusController {

    @Autowired private SessionPersistentRegistry sessionPersistentRegistry;
    @Autowired private SessionsInterface sessionInterface;

    @Autowired private CustomHttpSessionListener customHttpSessionListener;

    // Returns the current session ID or 401 if no session exists
    @GetMapping("/session")
    public ResponseEntity<String> getSession(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("No session found");
        } else {
            return ResponseEntity.ok(session.getId());
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

    // Checks if the session is active and valid according to user session limits
    @GetMapping("/session/status")
    public ResponseEntity<String> getSessionStatus(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication != null && authentication.isAuthenticated()) {
            Object principalTest = authentication.getPrincipal();
            String username = UserUtils.getUsernameFromPrincipal(principalTest);

            List<SessionInformation> allSessions =
                    sessionPersistentRegistry.getAllSessions(username, false);

            boolean isActivSession =
                    sessionPersistentRegistry.getAllSessions().stream()
                            .filter(
                                    sessionEntity ->
                                            session.getId().equals(sessionEntity.getSessionId()))
                            .anyMatch(sessionEntity -> !sessionEntity.isExpired());

            int userSessions = allSessions.size();
            int maxUserSessions = sessionInterface.getMaxUserSessions();

            // Check if the current session is valid or expired based on the session registry
            if (userSessions >= maxUserSessions && !isActivSession) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body("Session invalid or expired");
            } else if (session.getId() != null && isActivSession) {
                return ResponseEntity.ok("Valid session: " + session.getId());
            } else {
                return ResponseEntity.ok(
                        "User: " + username + " has " + userSessions + " sessions");
            }
        } else {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body("Session invalid or expired");
        }
    }

    // Invalidates the current session
    @GetMapping("/session/expire")
    public ResponseEntity<String> expireSession(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            sessionPersistentRegistry.expireSession(session.getId());
            return ResponseEntity.ok("Session invalidated");
        } else {
            return ResponseEntity.ok("No session to invalidate");
        }
    }

    // Invalidates all sessions
    @GetMapping("/session/expire/all")
    public ResponseEntity<String> expireAllSessions() {
        log.debug("Expire all sessions");
        sessionPersistentRegistry.expireAllSessions();
        return ResponseEntity.ok("All sessions invalidated");
    }

    // Invalidates all sessions for a specific user, only if requested by the same user
    @GetMapping("/session/expire/{username}")
    public ResponseEntity<String> expireAllSessionsByUsername(@PathVariable String username) {
        SecurityContext cxt = SecurityContextHolder.getContext();
        Authentication auth = cxt.getAuthentication();
        if (auth != null && auth.isAuthenticated()) {
            Object principal = auth.getPrincipal();
            String principalName = UserUtils.getUsernameFromPrincipal(principal);
            if (principalName.equals(username)) {
                sessionPersistentRegistry.expireAllSessionsByUsername(username);
                return ResponseEntity.ok("All sessions invalidated for user: " + username);
            } else {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
            }
        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
    }
}
