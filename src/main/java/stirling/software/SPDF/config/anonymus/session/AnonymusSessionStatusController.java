package stirling.software.SPDF.config.anonymus.session;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import lombok.extern.slf4j.Slf4j;

@RestController
public class AnonymusSessionStatusController {

    @Autowired private AnonymusSessionRegistry sessionRegistry;

    @GetMapping("/session/status")
    public ResponseEntity<String> getSessionStatus(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("No session found");
        }

        boolean isActivSesssion =
                sessionRegistry.getAllSessions().stream()
                        .filter(s -> s.getSessionId().equals(session.getId()))
                        .anyMatch(s -> !s.isExpired());

        long sessionCount =
                sessionRegistry.getAllSessions().stream().filter(s -> !s.isExpired()).count();

        long userSessions = sessionCount;
        int maxUserSessions = sessionRegistry.getMaxUserSessions();

        if (userSessions >= maxUserSessions && !isActivSesssion) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body("Session ungültig oder abgelaufen");
        } else if (session.getId() != null && isActivSesssion) {
            return ResponseEntity.ok("Session gültig: " + session.getId());
        } else {
            return ResponseEntity.ok("User has " + userSessions + " sessions");
        }
    }

    @GetMapping("/session/expire")
    public ResponseEntity<String> expireSession(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            sessionRegistry.expireSession(session.getId());
            return ResponseEntity.ok("Session invalidated");
        } else {
            return ResponseEntity.ok("No session to invalidate");
        }
    }

    @GetMapping("/session/expire/all")
    public ResponseEntity<String> expireAllSessions() {
        sessionRegistry.expireAllSessions();
        return ResponseEntity.ok("All sessions invalidated");
    }

    @GetMapping("/session/expire/{username}")
    public ResponseEntity<String> expireAllSessionsByUsername(@PathVariable String username) {
        sessionRegistry.expireAllSessionsByUsername(username);
        return ResponseEntity.ok("All sessions invalidated for user: " + username);
    }
}
