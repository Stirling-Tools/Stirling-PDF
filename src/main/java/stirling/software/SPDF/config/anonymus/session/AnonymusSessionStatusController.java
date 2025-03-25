package stirling.software.SPDF.config.anonymus.session;

import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import lombok.extern.slf4j.Slf4j;

@RestController
@Slf4j
public class AnonymusSessionStatusController {

    @Autowired private AnonymusSessionRegistry sessionRegistry;
    private static final int MAX_SESSIONS = 3;

    @GetMapping("/session/status")
    public ResponseEntity<String> getSessionStatus(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        List<AnonymusSessionInfo> allNonExpiredSessions =
                new ArrayList<>(sessionRegistry.getAllNonExpiredSessions());

        for (AnonymusSessionInfo info : allNonExpiredSessions) {
            log.info(
                    "Session ID: {}, Created At: {}, Last Request: {}, Expired: {}",
                    info.getSession().getId(),
                    info.getCreatedAt(),
                    info.getLastRequest(),
                    info.isExpired());
        }

        if (allNonExpiredSessions.size() > MAX_SESSIONS) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body("Session ungültig oder abgelaufen");
        } else if (session != null) {
            return ResponseEntity.ok("Session gültig: " + session.getId());
        } else {
            return ResponseEntity.ok("User has session");
        }
    }
}
