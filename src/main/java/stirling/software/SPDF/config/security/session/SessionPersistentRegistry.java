package stirling.software.SPDF.config.security.session;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Component;

import jakarta.transaction.Transactional;
import stirling.software.SPDF.model.SessionEntity;

@Component
public class SessionPersistentRegistry implements SessionRegistry {

    private final SessionRepository sessionRepository;

    @Value("${server.servlet.session.timeout:30m}")
    private Duration defaultMaxInactiveInterval;

    public SessionPersistentRegistry(SessionRepository sessionRepository) {
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
        String principalName = null;

        if (principal instanceof UserDetails) {
            principalName = ((UserDetails) principal).getUsername();
        } else if (principal instanceof OAuth2User) {
            principalName = ((OAuth2User) principal).getName();
        } else if (principal instanceof String) {
            principalName = (String) principal;
        }

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
        String principalName = null;

        if (principal instanceof UserDetails) {
            principalName = ((UserDetails) principal).getUsername();
        } else if (principal instanceof OAuth2User) {
            principalName = ((OAuth2User) principal).getName();
        } else if (principal instanceof String) {
            principalName = (String) principal;
        }

        if (principalName != null) {
            SessionEntity sessionEntity = new SessionEntity();
            sessionEntity.setSessionId(sessionId);
            sessionEntity.setPrincipalName(principalName);
            sessionEntity.setLastRequest(new Date()); // Set lastRequest to the current date
            sessionEntity.setExpired(false);
            sessionRepository.save(sessionEntity);
        }
    }

    @Override
    @Transactional
    public void removeSessionInformation(String sessionId) {
        sessionRepository.deleteById(sessionId);
    }

    @Override
    @Transactional
    public void refreshLastRequest(String sessionId) {
        Optional<SessionEntity> sessionEntityOpt = sessionRepository.findById(sessionId);
        if (sessionEntityOpt.isPresent()) {
            SessionEntity sessionEntity = sessionEntityOpt.get();
            sessionEntity.setLastRequest(new Date()); // Update lastRequest to the current date
            sessionRepository.save(sessionEntity);
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
    public void updateSessionByPrincipalName(
            String principalName, boolean expired, Date lastRequest) {
        sessionRepository.saveByPrincipalName(expired, lastRequest, principalName);
    }

    // Find the latest session for a given principal name
    public Optional<SessionEntity> findLatestSession(String principalName) {
        List<SessionEntity> allSessions = sessionRepository.findByPrincipalName(principalName);
        if (allSessions.isEmpty()) {
            return Optional.empty();
        }

        // Sort sessions by lastRequest in descending order
        Collections.sort(
                allSessions,
                new Comparator<SessionEntity>() {
                    @Override
                    public int compare(SessionEntity s1, SessionEntity s2) {
                        // Sort by lastRequest in descending order
                        return s2.getLastRequest().compareTo(s1.getLastRequest());
                    }
                });

        // The first session in the list is the latest session for the given principal name
        return Optional.of(allSessions.get(0));
    }
}
