package stirling.software.SPDF.config.anonymus.session;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

@RestController
public class AnonymusSessionStatusController {

    @Autowired private AnonymusSessionListener sessionRegistry;

    @GetMapping("/session/status")
    public ResponseEntity<String> getSessionStatus(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            // No session found
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("No session found");
        }

        boolean isActiveSession =
                sessionRegistry.getAllSessions().stream()
                        .filter(s -> s.getSessionId().equals(session.getId()))
                        .anyMatch(s -> !s.isExpired());

        long sessionCount =
                sessionRegistry.getAllSessions().stream().filter(s -> !s.isExpired()).count();

        long userSessions = sessionCount;
        int maxUserSessions = sessionRegistry.getMaxUserSessions();

        // Session invalid or expired
        if (userSessions >= maxUserSessions && !isActiveSession) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body("Session invalid or expired");
        }
        // Valid session
        else if (session.getId() != null && isActiveSession) {
            return ResponseEntity.ok("Valid session: " + session.getId());
        }
        // Fallback message with session count
        else {
            return ResponseEntity.ok("User has " + userSessions + " sessions");
        }
    }

    @GetMapping("/session/expire")
    public ResponseEntity<String> expireSession(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            // Invalidate current session
            sessionRegistry.expireSession(session.getId());
            return ResponseEntity.ok("Session invalidated");
        } else {
            return ResponseEntity.ok("No session to invalidate");
        }
    }

    @GetMapping("/session/expire/all")
    public ResponseEntity<String> expireAllSessions() {
        // Invalidate all sessions
        sessionRegistry.expireAllSessions();
        return ResponseEntity.ok("All sessions invalidated");
    }

    @GetMapping("/session/expire/{username}")
    public ResponseEntity<String> expireAllSessionsByUsername(@PathVariable String username) {
        // Invalidate all sessions for specific user
        sessionRegistry.expireAllSessionsByUsername(username);
        return ResponseEntity.ok("All sessions invalidated for user: " + username);
    }
}
