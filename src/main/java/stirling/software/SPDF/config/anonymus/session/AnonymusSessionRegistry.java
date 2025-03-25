package stirling.software.SPDF.config.anonymus.session;

import java.util.Collection;
import java.util.Date;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.HttpSessionEvent;
import jakarta.servlet.http.HttpSessionListener;

import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class AnonymusSessionRegistry implements HttpSessionListener {

    // Map zur Speicherung der Sessions inkl. Timestamp
    private static final Map<String, AnonymusSessionInfo> sessions = new ConcurrentHashMap<>();

    @Override
    public void sessionCreated(HttpSessionEvent event) {
        HttpSession session = event.getSession();
        if (session == null) {
            log.info("Session ist null");
            return;
        }

        System.out.println("");
        System.out.println("Session created with id: " + session.getId());
        System.out.println("");

        if (sessions.containsKey(session.getId())) {
            log.info("Session {} existiert bereits", session.getId());
            return;
        }

        // Speichern des anonymousUser-Flags
        session.setAttribute("anonymousUser", true);
        // Speichern des Erstellungszeitpunkts
        Date creationTime = new Date();
        session.setAttribute("creationTimestamp", creationTime);
        sessions.put(
                session.getId(),
                new AnonymusSessionInfo(session, creationTime, creationTime, false));

        log.info("Session {} erstellt um {}", session.getId(), creationTime);
    }

    @Override
    public void sessionDestroyed(HttpSessionEvent event) {
        HttpSession session = event.getSession();
        if (session == null) {
            log.info("Session ist null");
            return;
        }
        AnonymusSessionInfo sessionsInfo = sessions.get(session.getId());
        if (sessionsInfo == null) {
            log.info("Session {} existiert nicht", session.getId());
            return;
        }
        sessionsInfo.setExpired(true);
        log.info("Session {} wurde Expired=TRUE", session.getId());
    }

    public Collection<AnonymusSessionInfo> getAllSessions() {
        return sessions.values();
    }

    public Collection<AnonymusSessionInfo> getAllNonExpiredSessions() {
        return sessions.values().stream().filter(info -> !info.isExpired()).toList();
    }
}
