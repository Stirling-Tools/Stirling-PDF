package stirling.software.SPDF.config.anonymus.session;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.config.security.UserUtils;
import stirling.software.SPDF.config.security.session.SessionPersistentRegistry;

@RestController
public class SessionStatusController {

    @Autowired private SessionPersistentRegistry sessionPersistentRegistry;

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
            int maxUserSessions = sessionPersistentRegistry.getMaxUserSessions();

            if (userSessions >= maxUserSessions && !isActivSession) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body("Session ungültig oder abgelaufen");
            } else if (session.getId() != null && isActivSession) {
                return ResponseEntity.ok("Session gültig: " + session.getId());
            } else {
                return ResponseEntity.ok(
                        "User: " + username + " has " + userSessions + " sessions");
            }
        } else {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Session ungültig oder abgelaufen");
        }
    }

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

    @GetMapping("/session/expire/all")
    public ResponseEntity<String> expireAllSessions() {
        sessionPersistentRegistry.expireAllSessions();
        return ResponseEntity.ok("All sessions invalidated");
    }

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
