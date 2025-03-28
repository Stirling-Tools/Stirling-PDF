package stirling.software.SPDF.config.security.session;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.stereotype.Component;

import jakarta.transaction.Transactional;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.security.UserUtils;
import stirling.software.SPDF.model.SessionEntity;

@Component
@Slf4j
public class SessionPersistentRegistry implements SessionRegistry {

    private final SessionRepository sessionRepository;
    private final boolean runningEE;

    @Value("${server.servlet.session.timeout:30m}")
    private Duration defaultMaxInactiveInterval;

    public SessionPersistentRegistry(
            SessionRepository sessionRepository, @Qualifier("runningEE") boolean runningEE) {
        this.runningEE = runningEE;
        this.sessionRepository = sessionRepository;
    }

    @Override
    public List<Object> getAllPrincipals() {
        List<SessionEntity> sessions = sessionRepository.findAll();
        List<Object> principals = new ArrayList<>();
        for (SessionEntity session : sessions) {
            principals.add(session.getPrincipalName());
        }
        return principals;
    }

    @Override
    public List<SessionInformation> getAllSessions(
            Object principal, boolean includeExpiredSessions) {
        List<SessionInformation> sessionInformations = new ArrayList<>();
        String principalName = UserUtils.getUsernameFromPrincipal(principal);

        if (principalName != null) {
            List<SessionEntity> sessionEntities =
                    sessionRepository.findByPrincipalName(principalName);
            for (SessionEntity sessionEntity : sessionEntities) {
                if (includeExpiredSessions || !sessionEntity.isExpired()) {
                    sessionInformations.add(
                            new SessionInformation(
                                    sessionEntity.getPrincipalName(),
                                    sessionEntity.getSessionId(),
                                    sessionEntity.getLastRequest()));
                }
            }
        }
        return sessionInformations;
    }

    @Override
    @Transactional
    public void registerNewSession(String sessionId, Object principal) {
        String principalName = UserUtils.getUsernameFromPrincipal(principal);

        if (principalName != null) {

            int sessionUserCount = getAllSessions(principalName, false).size();

            if (sessionUserCount >= getMaxUserSessions()) {
                return;
            }
            SessionEntity sessionEntity = sessionRepository.findBySessionId(sessionId);
            if (sessionEntity == null) {
                sessionEntity = new SessionEntity();
                sessionEntity.setSessionId(sessionId);
                log.debug("Registering new session for principal: {}", principalName);
            }
            sessionEntity.setPrincipalName(principalName);
            sessionEntity.setLastRequest(new Date()); // Set lastRequest to the current date
            sessionEntity.setExpired(false);
            sessionRepository.save(sessionEntity);
            sessionRepository.flush();
        }
    }

    @Override
    @Transactional
    public void removeSessionInformation(String sessionId) {
        sessionRepository.deleteById(sessionId);
        sessionRepository.flush();
    }

    @Transactional
    public void removeSessionInformationByPrincipalName(String principalName) {
        sessionRepository.deleteByPrincipalName(principalName);
        sessionRepository.flush();
    }

    @Override
    @Transactional
    public void refreshLastRequest(String sessionId) {
        SessionEntity sessionEntity = sessionRepository.findBySessionId(sessionId);
        if (sessionEntity != null) {
            sessionEntity.setLastRequest(new Date()); // Update lastRequest to the current date
            sessionRepository.save(sessionEntity);
        } else {
            log.error("Session not found for session ID: {}", sessionId);
        }
    }

    @Transactional
    public void expireOldestSessionForPrincipal(String principalName) {
        // Alle Sessions des principalName abrufen
        List<SessionEntity> sessionsForPrincipal =
                sessionRepository.findByPrincipalName(principalName);

        // Nur die nicht abgelaufenen Sessions filtern
        List<SessionEntity> nonExpiredSessions =
                sessionsForPrincipal.stream()
                        .filter(session -> !session.isExpired())
                        .collect(Collectors.toList());

        if (nonExpiredSessions.isEmpty()) {
            log.debug("No active sessions found for principal {}", principalName);
            return;
        }

        // Die Session mit dem ältesten lastRequest ermitteln
        Optional<SessionEntity> oldestSessionOpt =
                nonExpiredSessions.stream()
                        .min(Comparator.comparing(SessionEntity::getLastRequest));

        if (oldestSessionOpt.isPresent()) {
            SessionEntity oldestSession = oldestSessionOpt.get();
            expireSession(oldestSession.getSessionId());
            removeSessionInformation(oldestSession.getSessionId());
            log.debug(
                    "Oldest session {} for principal {} has been marked as expired",
                    oldestSession.getSessionId(),
                    principalName);
        }
    }

    @Override
    public SessionInformation getSessionInformation(String sessionId) {
        Optional<SessionEntity> sessionEntityOpt = sessionRepository.findById(sessionId);
        if (sessionEntityOpt.isPresent()) {
            SessionEntity sessionEntity = sessionEntityOpt.get();
            return new SessionInformation(
                    sessionEntity.getPrincipalName(),
                    sessionEntity.getSessionId(),
                    sessionEntity.getLastRequest());
        }
        return null;
    }

    // Retrieve all non-expired sessions
    public List<SessionEntity> getAllSessionsNotExpired() {
        return sessionRepository.findByExpired(false);
    }

    // Retrieve all sessions
    public List<SessionEntity> getAllSessions() {
        return sessionRepository.findAll();
    }

    // Mark a session as expired
    public void expireSession(String sessionId) {
        Optional<SessionEntity> sessionEntityOpt = sessionRepository.findById(sessionId);
        if (sessionEntityOpt.isPresent()) {
            SessionEntity sessionEntity = sessionEntityOpt.get();
            sessionEntity.setExpired(true); // Set expired to true
            sessionRepository.save(sessionEntity);
            log.debug("Session expired: {}", sessionId);
        }
    }

    // Mark all sessions as expired
    public void expireAllSessions() {
        List<SessionEntity> sessionEntities = sessionRepository.findAll();
        for (SessionEntity sessionEntity : sessionEntities) {
            sessionEntity.setExpired(true); // Set expired to true
            sessionRepository.save(sessionEntity);
            log.debug("Session expired: {}", sessionEntity.getSessionId());
        }
    }

    // Mark all sessions as expired by username
    public void expireAllSessionsByUsername(String username) {
        List<SessionEntity> sessionEntities = sessionRepository.findByPrincipalName(username);
        for (SessionEntity sessionEntity : sessionEntities) {
            sessionEntity.setExpired(true); // Set expired to true
            sessionRepository.save(sessionEntity);
            log.debug("Session expired: {}", sessionEntity.getSessionId());
        }
    }

    // Mark all sessions as expired for a given principal name
    public void expireAllSessionsByPrincipalName(String principalName) {
        List<SessionEntity> sessionEntities = sessionRepository.findByPrincipalName(principalName);
        log.debug("Session entities: {}", sessionEntities.size());
        for (SessionEntity sessionEntity : sessionEntities) {
            log.debug(
                    "Session expired: {} {} {}",
                    sessionEntity.getPrincipalName(),
                    sessionEntity.isExpired(),
                    sessionEntity.getSessionId());
            sessionEntity.setExpired(true); // Set expired to true
            removeSessionInformation(sessionEntity.getSessionId());
        }

        sessionEntities = sessionRepository.findByPrincipalName(principalName);
        log.debug("Session entities: {}", sessionEntities.size());
        for (SessionEntity sessionEntity : sessionEntities) {
            if (sessionEntity.getPrincipalName().equals(principalName)) {
                log.debug("Session expired: {}", sessionEntity.getSessionId());
            }
        }
    }

    // Get the maximum inactive interval for sessions
    public int getMaxInactiveInterval() {
        return (int) defaultMaxInactiveInterval.getSeconds();
    }

    // Retrieve a session entity by session ID
    public SessionEntity getSessionEntity(String sessionId) {
        return sessionRepository.findBySessionId(sessionId);
    }

    // Update session details by principal name
    // public void updateSessionByPrincipalName(
    //         String principalName, boolean expired, Date lastRequest) {
    //     sessionRepository.saveByPrincipalName(expired, lastRequest, principalName);
    // }

    // Update session details by session ID
    // public void updateSessionBySessionId(String sessionId) {
    //     SessionEntity sessionEntity = getSessionEntity(sessionId);
    //     if (sessionEntity != null) {
    //         sessionEntity.setLastRequest(new Date());
    //         sessionRepository.save(sessionEntity);
    //     }
    // }

    // Find the latest session for a given principal name
    public Optional<SessionEntity> findLatestSession(String principalName) {
        List<SessionEntity> allSessions = sessionRepository.findByPrincipalName(principalName);
        if (allSessions.isEmpty()) {
            return Optional.empty();
        }

        // Sort sessions by lastRequest in descending order
        Collections.sort(
                allSessions,
                (SessionEntity s1, SessionEntity s2) ->
                        s2.getLastRequest().compareTo(s1.getLastRequest()));

        // The first session in the list is the latest session for the given principal name
        return Optional.of(allSessions.get(0));
    }

    // Get the maximum number of sessions
    public int getMaxSessions() {
        if (runningEE) {
            return Integer.MAX_VALUE;
        }
        return getMaxUserSessions() * 10;
    }

    // Get the maximum number of user sessions
    public int getMaxUserSessions() {
        if (runningEE) {
            return Integer.MAX_VALUE;
        }
        return 3;
    }
}
