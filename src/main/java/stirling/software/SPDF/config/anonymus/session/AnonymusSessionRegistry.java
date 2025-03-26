package stirling.software.SPDF.config.anonymus.session;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Collection;
import java.util.Comparator;
import java.util.Date;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.HttpSessionEvent;
import jakarta.servlet.http.HttpSessionListener;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.interfaces.SessionsInterface;

@Component
@Slf4j
public class AnonymusSessionRegistry implements HttpSessionListener, SessionsInterface {

    @Value("${server.servlet.session.timeout:120s}") // TODO: Change to 30m
    private Duration defaultMaxInactiveInterval;

    private static final int MAX_SESSIONS = 1;

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

        int allNonExpiredSessions = getAllNonExpiredSessions().size();

        if (allNonExpiredSessions >= MAX_SESSIONS) {
            log.info("Maximale Anzahl an Sessions erreicht");
            sessions.put(
                    session.getId(),
                    new AnonymusSessionInfo(session, creationTime, creationTime, true));
        } else {
            sessions.put(
                    session.getId(),
                    new AnonymusSessionInfo(session, creationTime, creationTime, false));
        }
    }

    @Override
    public void sessionDestroyed(HttpSessionEvent event) {
        HttpSession session = event.getSession();
        if (session == null) {
            return;
        }
        AnonymusSessionInfo sessionsInfo = sessions.get(session.getId());
        if (sessionsInfo == null) {
            return;
        }

        Date lastRequest = sessionsInfo.getLastRequest();
        int maxInactiveInterval = (int) defaultMaxInactiveInterval.getSeconds();
        Instant now = Instant.now();
        Instant expirationTime =
                lastRequest.toInstant().plus(maxInactiveInterval, ChronoUnit.SECONDS);

        if (now.isAfter(expirationTime)) {
            sessionsInfo.setExpired(true);
            session.invalidate();
            log.info("Session {} wurde Expired=TRUE", session.getId());
        }
    }

    @Override
    public boolean isSessionValid(String sessionId) {
        boolean exists = sessions.containsKey(sessionId);
        boolean expired = exists ? sessions.get(sessionId).isExpired() : false;
        return exists && !expired;
    }

    @Override
    public boolean isOldestNonExpiredSession(String sessionId) {
        Collection<AnonymusSessionInfo> nonExpiredSessions = getAllNonExpiredSessions();
        return nonExpiredSessions.stream()
                .min(Comparator.comparing(AnonymusSessionInfo::getLastRequest))
                .map(oldest -> oldest.getSession().getId().equals(sessionId))
                .orElse(false);
    }

    @Override
    public void updateSessionLastRequest(String sessionId) {
        if (sessions.containsKey(sessionId)) {
            AnonymusSessionInfo sessionInfo = sessions.get(sessionId);
            sessionInfo.setLastRequest(new Date());
        }
    }

    @Override
    public Collection<AnonymusSessionInfo> getAllSessions() {
        return sessions.values();
    }

    @Override
    public Collection<AnonymusSessionInfo> getAllNonExpiredSessions() {
        return sessions.values().stream().filter(info -> !info.isExpired()).toList();
    }
}
