package stirling.software.SPDF.config.security.session;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.HttpSessionEvent;
import jakarta.servlet.http.HttpSessionListener;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.interfaces.SessionsInterface;
import stirling.software.SPDF.config.interfaces.SessionsModelInterface;
import stirling.software.SPDF.config.security.UserUtils;
import stirling.software.SPDF.model.ApplicationProperties;

@Component
@Slf4j
public class CustomHttpSessionListener implements HttpSessionListener, SessionsInterface {

    private final SessionPersistentRegistry sessionPersistentRegistry;
    private final ApplicationProperties applicationProperties;
    private final boolean loginEnabled;
    private final boolean runningEE;

    @Value("${server.servlet.session.timeout:30m}")
    private Duration defaultMaxInactiveInterval;

    public CustomHttpSessionListener(
            SessionPersistentRegistry sessionPersistentRegistry,
            @Qualifier("loginEnabled") boolean loginEnabled,
            @Qualifier("runningEE") boolean runningEE,
            ApplicationProperties applicationProperties) {
        super();
        this.sessionPersistentRegistry = sessionPersistentRegistry;
        this.loginEnabled = loginEnabled;
        this.runningEE = runningEE;
        this.applicationProperties = applicationProperties;
    }

    @Override
    public Collection<SessionsModelInterface> getAllNonExpiredSessions() {
        return sessionPersistentRegistry.getAllSessionsNotExpired().stream()
                .map(session -> (SessionsModelInterface) session)
                .toList();
    }

    public List<SessionsModelInterface> getAllSessions(Object principalName, boolean expired) {
        return sessionPersistentRegistry.getAllSessions().stream()
                .filter(s -> s.getPrincipalName().equals(principalName))
                .filter(s -> expired == s.isExpired())
                .sorted(Comparator.comparing(SessionsModelInterface::getLastRequest))
                .collect(Collectors.toList());
    }

    @Override
    public Collection<SessionsModelInterface> getAllSessions() {
        return new ArrayList<>(sessionPersistentRegistry.getAllSessions());
    }

    @Override
    public void updateSessionLastRequest(String sessionId) {
        sessionPersistentRegistry.refreshLastRequest(sessionId);
    }

    public Optional<SessionsModelInterface> findLatestSession(String principalName) {
        return getAllSessions(principalName, false).stream()
                .filter(s -> s.getPrincipalName().equals(principalName))
                .max(Comparator.comparing(SessionsModelInterface::getLastRequest));
    }

    public void expireSession(String sessionId) {
        sessionPersistentRegistry.expireSession(sessionId);
    }

    public int getMaxInactiveInterval() {
        return (int) defaultMaxInactiveInterval.getSeconds();
    }

    @Override
    public void sessionCreated(HttpSessionEvent se) {
        HttpSession session = se.getSession();
        if (session == null) {
            return;
        }
        SecurityContext securityContext = SecurityContextHolder.getContext();
        if (securityContext == null) {
            return;
        }
        Authentication authentication = securityContext.getAuthentication();
        if (authentication == null) {
            return;
        }
        Object principal = authentication.getPrincipal();
        if (principal == null) {
            return;
        }
        String principalName = UserUtils.getUsernameFromPrincipal(principal);
        if (principalName == null) {
            return;
        }
        if ("anonymousUser".equals(principalName) && loginEnabled) {
            return;
        }

        int allNonExpiredSessions;

        if ("anonymousUser".equals(principalName) && !loginEnabled) {
            allNonExpiredSessions =
                    (int) getAllSessions().stream().filter(s -> !s.isExpired()).count();
        } else {
            allNonExpiredSessions =
                    (int)
                            getAllSessions().stream()
                                    .filter(s -> !s.isExpired())
                                    .filter(s -> s.getPrincipalName().equals(principalName))
                                    .count();
        }

        int all =
                getAllSessions().stream()
                        .filter(s -> !s.isExpired() && s.getPrincipalName().equals(principalName))
                        .toList()
                        .size();
        boolean isAnonymousUserWithoutLogin = "anonymousUser".equals(principalName) && loginEnabled;
        log.debug(
                "all {} allNonExpiredSessions {} {} isAnonymousUserWithoutLogin {}",
                all,
                allNonExpiredSessions,
                getMaxUserSessions(),
                isAnonymousUserWithoutLogin);

        if (allNonExpiredSessions >= getMaxApplicationSessions() && !isAnonymousUserWithoutLogin) {
            log.debug("Session {} Expired=TRUE", session.getId());
            sessionPersistentRegistry.expireSession(session.getId());
            sessionPersistentRegistry.removeSessionInformation(se.getSession().getId());
            // if (allNonExpiredSessions > getMaxUserSessions()) {
            //     enforceMaxSessionsForPrincipal(principalName);
            // }
        } else if (all >= getMaxUserSessions() && !isAnonymousUserWithoutLogin) {
            enforceMaxSessionsForPrincipal(principalName);
            log.debug("Session {} Expired=TRUE", session.getId());
        } else if (isAnonymousUserWithoutLogin) {
            sessionPersistentRegistry.expireSession(session.getId());
            sessionPersistentRegistry.removeSessionInformation(se.getSession().getId());
        } else {
            log.debug("Session created: {}", session.getId());
            sessionPersistentRegistry.registerNewSession(se.getSession().getId(), principalName);
        }
    }

    private void enforceMaxSessionsForPrincipal(String principalName) {
        // Alle aktiven Sessions des Benutzers über das gemeinsame Interface abrufen
        List<SessionsModelInterface> userSessions =
                getAllSessions().stream()
                        .filter(s -> !s.isExpired() && principalName.equals(s.getPrincipalName()))
                        .sorted(Comparator.comparing(SessionsModelInterface::getLastRequest))
                        .collect(Collectors.toList());

        int maxAllowed = getMaxUserSessions();
        if (userSessions.size() > maxAllowed) {
            int sessionsToRemove = userSessions.size() - maxAllowed;
            log.debug(
                    "User {} has {} active sessions, removing {} oldest session(s).",
                    principalName,
                    userSessions.size(),
                    sessionsToRemove);
            for (int i = 0; i < sessionsToRemove; i++) {
                SessionsModelInterface sessionModel = userSessions.get(i);
                // Statt auf die HttpSession zuzugreifen, rufen wir die Registry-Methoden auf,
                // die die Session anhand der Session-ID invalidieren und entfernen.
                sessionPersistentRegistry.expireSession(sessionModel.getSessionId());
                sessionPersistentRegistry.removeSessionInformation(sessionModel.getSessionId());
                log.debug(
                        "Removed session {} for principal {}",
                        sessionModel.getSessionId(),
                        principalName);
            }
        }
    }

    @Override
    public void sessionDestroyed(HttpSessionEvent se) {
        HttpSession session = se.getSession();
        if (session == null) {
            return;
        }
        SessionInformation sessionsInfo =
                sessionPersistentRegistry.getSessionInformation(session.getId());
        if (sessionsInfo == null) {
            return;
        }

        Date lastRequest = sessionsInfo.getLastRequest();
        int maxInactiveInterval = (int) defaultMaxInactiveInterval.getSeconds();
        Instant now = Instant.now();
        Instant expirationTime =
                lastRequest.toInstant().plus(maxInactiveInterval, ChronoUnit.SECONDS);

        if (now.isAfter(expirationTime)) {
            sessionPersistentRegistry.expireSession(session.getId());
            session.invalidate();
            sessionPersistentRegistry.removeSessionInformation(se.getSession().getId());
            log.debug("Session {} expired=TRUE", session.getId());
        }
    }

    @Override
    public void registerSession(HttpSession session) {
        sessionCreated(new HttpSessionEvent(session));
    }

    @Override
    public void removeSession(HttpSession session) {
        sessionPersistentRegistry.expireSession(session.getId());
        session.invalidate();
        sessionPersistentRegistry.removeSessionInformation(session.getId());
        log.debug("Session {} expired=TRUE", session.getId());
    }

    // Get the maximum number of application sessions
    @Override
    public int getMaxApplicationSessions() {
        return getMaxUsers() * getMaxUserSessions();
    }

    // Get the maximum number of user sessions
    @Override
    public int getMaxUserSessions() {
        if (loginEnabled) {
            return 3;
        }
        return 10;
    }

    // Get the maximum number of user sessions
    @Override
    public int getMaxUsers() {
        if (loginEnabled) {
            if (runningEE) {
                int maxUsers = applicationProperties.getPremium().getMaxUsers();
                if (maxUsers > 0) {
                    return maxUsers;
                }
            }
            return 50;
        }
        return 1;
    }
}
