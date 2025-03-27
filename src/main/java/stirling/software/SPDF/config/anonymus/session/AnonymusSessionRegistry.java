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
import stirling.software.SPDF.config.interfaces.SessionsModelInterface;

@Component
@Slf4j
public class AnonymusSessionRegistry implements HttpSessionListener, SessionsInterface {

    @Value("${server.servlet.session.timeout:120s}") // TODO: Change to 30m
    private Duration defaultMaxInactiveInterval;

    // Map zur Speicherung der Sessions inkl. Timestamp
    private static final Map<String, SessionsModelInterface> sessions = new ConcurrentHashMap<>();

    @Override
    public void sessionCreated(HttpSessionEvent event) {
        HttpSession session = event.getSession();
        if (session == null) {
            return;
        }

        if (sessions.containsKey(session.getId())) {
            return;
        }

        session.setAttribute("principalName", "anonymousUser");

        // Speichern des Erstellungszeitpunkts
        Date creationTime = new Date();

        int allNonExpiredSessions = getAllNonExpiredSessions().size();

        if (allNonExpiredSessions >= getMaxUserSessions()) {
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
        AnonymusSessionInfo sessionsInfo = (AnonymusSessionInfo) sessions.get(session.getId());
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

    // Make a session as expired
    public void expireSession(String sessionId) {
        if (sessions.containsKey(sessionId)) {
            AnonymusSessionInfo sessionInfo = (AnonymusSessionInfo) sessions.get(sessionId);
            sessionInfo.setExpired(true);
            try {
                sessionInfo.getSession().invalidate();
            } catch (IllegalStateException e) {
                log.info("Session {} ist bereits invalidiert", sessionInfo.getSession().getId());
            }
        }
    }

    // Make all sessions as expired
    public void expireAllSessions() {
        sessions.values()
                .forEach(
                        sessionInfo -> {
                            AnonymusSessionInfo info = (AnonymusSessionInfo) sessionInfo;
                            info.setExpired(true);
                            HttpSession session = info.getSession();
                            try {
                                session.invalidate();
                            } catch (IllegalStateException e) {
                                log.info("Session {} ist bereits invalidiert", session.getId());
                            }
                        });
    }

    // Mark all sessions as expired by username
    public void expireAllSessionsByUsername(String username) {
        sessions.values().stream()
                .filter(
                        sessionInfo -> {
                            AnonymusSessionInfo info = (AnonymusSessionInfo) sessionInfo;
                            return info.getPrincipalName().equals(username);
                        })
                .forEach(
                        sessionInfo -> {
                            AnonymusSessionInfo info = (AnonymusSessionInfo) sessionInfo;
                            info.setExpired(true);
                            HttpSession session = info.getSession();
                            try {
                                session.invalidate();
                            } catch (IllegalStateException e) {
                                log.info("Session {} ist bereits invalidiert", session.getId());
                            }
                        });
    }

    @Override
    public boolean isSessionValid(String sessionId) {
        boolean exists = sessions.containsKey(sessionId);
        boolean expired = exists ? sessions.get(sessionId).isExpired() : false;
        return exists && !expired;
    }

    @Override
    public boolean isOldestNonExpiredSession(String sessionId) {
        Collection<SessionsModelInterface> nonExpiredSessions = getAllNonExpiredSessions();
        return nonExpiredSessions.stream()
                .min(Comparator.comparing(SessionsModelInterface::getLastRequest))
                .map(oldest -> oldest.getSessionId().equals(sessionId))
                .orElse(false);
    }

    @Override
    public void updateSessionLastRequest(String sessionId) {
        if (sessions.containsKey(sessionId)) {
            AnonymusSessionInfo sessionInfo = (AnonymusSessionInfo) sessions.get(sessionId);
            sessionInfo.setLastRequest(new Date());
        }
    }

    @Override
    public Collection<SessionsModelInterface> getAllSessions() {
        return sessions.values().stream().toList();
    }

    @Override
    public Collection<SessionsModelInterface> getAllNonExpiredSessions() {
        return sessions.values().stream().filter(info -> !info.isExpired()).toList();
    }

    public Collection<SessionsModelInterface> getAllIsExpiredSessions() {
        return sessions.values().stream().filter(SessionsModelInterface::isExpired).toList();
    }

    public void clear() {
        sessions.clear();
    }

    @Override
    public Collection<SessionsModelInterface> getAllNonExpiredSessionsBySessionId(
            String sessionId) {
        return sessions.values().stream()
                .filter(info -> !info.isExpired() && info.getSessionId().equals(sessionId))
                .toList();
    }

    @Override
    public void registerSession(HttpSession session) {
        if (!sessions.containsKey(session.getId())) {
            AnonymusSessionInfo sessionInfo =
                    new AnonymusSessionInfo(session, new Date(), new Date(), false);
            sessions.put(session.getId(), sessionInfo);
            log.info("Session {} wurde registriert", session.getId());
        }
    }

    @Override
    public int getMaxApplicationSessions() {
        return getMaxUserSessions();
    }

    @Override
    public void removeSession(HttpSession session) {
        AnonymusSessionInfo sessionsInfo = (AnonymusSessionInfo) sessions.get(session.getId());
        sessionsInfo.setExpired(true);
        session.invalidate();
        sessions.remove(session.getId());
    }
}
