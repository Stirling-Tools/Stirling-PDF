package stirling.software.SPDF.config.anonymus.session;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Collection;
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

    @Value("${server.servlet.session.timeout:30m}")
    private Duration defaultMaxInactiveInterval;

    // Map for storing sessions including timestamp
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

        // Save creation timestamp
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
            log.debug("Session {} expired=TRUE", session.getId());
        }
    }

    // Mark a single session as expired
    public void expireSession(String sessionId) {
        if (sessions.containsKey(sessionId)) {
            AnonymusSessionInfo sessionInfo = (AnonymusSessionInfo) sessions.get(sessionId);
            sessionInfo.setExpired(true);
            try {
                sessionInfo.getSession().invalidate();
            } catch (IllegalStateException e) {
                log.debug("Session {} already invalidated", sessionInfo.getSession().getId());
            }
        }
    }

    // Mark all sessions as expired
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
                                log.debug("Session {} already invalidated", session.getId());
                            }
                        });
    }

    // Expire all sessions by username
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
                                log.debug("Session {} already invalidated", session.getId());
                            }
                        });
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
    public void registerSession(HttpSession session) {
        if (!sessions.containsKey(session.getId())) {
            AnonymusSessionInfo sessionInfo =
                    new AnonymusSessionInfo(session, new Date(), new Date(), false);
            sessions.put(session.getId(), sessionInfo);
            log.debug("Session {} registered", session.getId());
        }
    }

    @Override
    public void removeSession(HttpSession session) {
        AnonymusSessionInfo sessionsInfo = (AnonymusSessionInfo) sessions.get(session.getId());
        sessionsInfo.setExpired(true);
        session.invalidate();
        sessions.remove(session.getId());
    }

    @Override
    public int getMaxApplicationSessions() {
        return 5;
    }

    @Override
    public int getMaxUsers() {
        return 1;
    }
}
