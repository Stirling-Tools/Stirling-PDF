package stirling.software.SPDF.config.anonymus.session;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Date;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.interfaces.SessionsInterface;

@RestController
@Slf4j
public class AnonymusSessionStatusController {

    @Autowired private AnonymusSessionRegistry sessionRegistry;
    @Autowired private SessionsInterface sessionsInterface;
    private static final int MAX_SESSIONS = 1;

    @GetMapping("/session/status")
    public ResponseEntity<String> getSessionStatus(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("No session found");
        }

        Collection<AnonymusSessionInfo> allNonExpiredSessions =
                new ArrayList<>(sessionRegistry.getAllNonExpiredSessions());
        if (allNonExpiredSessions.isEmpty()) {
            allNonExpiredSessions.add(
                    new AnonymusSessionInfo(session, new Date(), new Date(), false));
        }

        // wenn session expire ist dann UNAUTHORIZED
        if (allNonExpiredSessions.stream()
                .anyMatch(s -> s.getSession().getId().equals(session.getId()) && s.isExpired())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Session expired");
        }

        // wenn nicht in der Liste dann UNAUTHORIZED
        if (allNonExpiredSessions.stream()
                .noneMatch(s -> s.getSession().getId().equals(session.getId()))) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("No session found");
        }

        if (allNonExpiredSessions.size() > MAX_SESSIONS
                && sessionsInterface.isSessionValid(session.getId())
                && sessionsInterface.isOldestNonExpiredSession(session.getId())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body("Session ungültig oder abgelaufen");
        }
        return ResponseEntity.ok("Session gültig: " + session.getId());
    }

    @GetMapping("/session/expire")
    public ResponseEntity<String> expireSession(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
            return ResponseEntity.ok("Session invalidated");
        } else {
            return ResponseEntity.ok("No session to invalidate");
        }
    }

    @GetMapping("/session/expire/all")
    public ResponseEntity<String> expireAllSessions() {
        sessionRegistry
                .getAllNonExpiredSessions()
                .forEach(sessionInfo -> sessionInfo.getSession().invalidate());
        return ResponseEntity.ok("All sessions invalidated");
    }
}
