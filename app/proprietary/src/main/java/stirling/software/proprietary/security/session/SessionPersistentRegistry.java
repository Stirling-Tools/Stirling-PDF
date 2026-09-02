package stirling.software.proprietary.security.session;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Optional;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import lombok.RequiredArgsConstructor;

import stirling.software.common.security.OAuth2User;
import stirling.software.common.security.SessionInformation;
import stirling.software.common.security.SessionRegistry;
import stirling.software.common.security.UserDetails;
import stirling.software.proprietary.security.database.repository.SessionRepository;
import stirling.software.proprietary.security.model.SessionEntity;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;

@ApplicationScoped
@RequiredArgsConstructor
public class SessionPersistentRegistry implements SessionRegistry {

    private final SessionRepository sessionRepository;

    @ConfigProperty(name = "server.servlet.session.timeout", defaultValue = "30m")
    Duration defaultMaxInactiveInterval;

    @Override
    public List<Object> getAllPrincipals() {
        List<SessionEntity> sessions = sessionRepository.listAll();
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

        switch (principal) {
            case null -> {}
            case UserDetails detailsUser -> principalName = detailsUser.getUsername();
            case OAuth2User oAuth2User -> principalName = oAuth2User.getName();
            case CustomSaml2AuthenticatedPrincipal saml2User -> principalName = saml2User.name();
            case String stringUser -> principalName = stringUser;
            default -> {}
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
                                    Date.from(sessionEntity.getLastRequest())));
                }
            }
        }
        return sessionInformations;
    }

    @Override
    @Transactional
    public void registerNewSession(String sessionId, Object principal) {
        String principalName = null;

        switch (principal) {
            case null -> {}
            case UserDetails detailsUser -> principalName = detailsUser.getUsername();
            case OAuth2User oAuth2User -> principalName = oAuth2User.getName();
            case CustomSaml2AuthenticatedPrincipal saml2User -> principalName = saml2User.name();
            case String stringUser -> principalName = stringUser;
            default -> {}
        }

        if (principalName != null) {
            // Clear old sessions for the principal (unsure if needed)
            //            List<SessionEntity> existingSessions =
            //                    sessionRepository.findByPrincipalName(principalName);
            //            for (SessionEntity session : existingSessions) {
            //                session.setExpired(true);
            //                sessionRepository.save(session);
            //            }

            SessionEntity sessionEntity = new SessionEntity();
            sessionEntity.setSessionId(sessionId);
            sessionEntity.setPrincipalName(principalName);
            sessionEntity.setLastRequest(Instant.now()); // Set lastRequest to the current date
            sessionEntity.setExpired(false);
            sessionRepository.persist(sessionEntity);
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
        Optional<SessionEntity> sessionEntityOpt = sessionRepository.findByIdOptional(sessionId);
        if (sessionEntityOpt.isPresent()) {
            SessionEntity sessionEntity = sessionEntityOpt.get();
            sessionEntity.setLastRequest(Instant.now()); // Update lastRequest to the current date
            sessionRepository.persist(sessionEntity);
        }
    }

    @Override
    public SessionInformation getSessionInformation(String sessionId) {
        Optional<SessionEntity> sessionEntityOpt = sessionRepository.findByIdOptional(sessionId);
        if (sessionEntityOpt.isPresent()) {
            SessionEntity sessionEntity = sessionEntityOpt.get();
            return new SessionInformation(
                    sessionEntity.getPrincipalName(),
                    sessionEntity.getSessionId(),
                    Date.from(sessionEntity.getLastRequest()));
        }
        return null;
    }

    // Retrieve all non-expired sessions
    public List<SessionEntity> getAllSessionsNotExpired() {
        return sessionRepository.findByExpired(false);
    }

    // Retrieve all sessions
    public List<SessionEntity> getAllSessions() {
        return sessionRepository.listAll();
    }

    // Flag every session idle past the timeout.
    public int expireStaleSessions() {
        return sessionRepository.expireOlderThan(Instant.now().minus(defaultMaxInactiveInterval));
    }

    // Purge sessions expired longer than the retention window.
    public int purgeExpiredSessions(Duration retention) {
        return sessionRepository.deleteExpiredOlderThan(Instant.now().minus(retention));
    }

    // Mark a session as expired
    @Transactional
    public void expireSession(String sessionId) {
        Optional<SessionEntity> sessionEntityOpt = sessionRepository.findByIdOptional(sessionId);
        if (sessionEntityOpt.isPresent()) {
            SessionEntity sessionEntity = sessionEntityOpt.get();
            sessionEntity.setExpired(true); // Set expired to true
            sessionRepository.persist(sessionEntity);
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
        sessionRepository.saveByPrincipalName(expired, lastRequest.toInstant(), principalName);
    }

    // Find the latest session for a given principal name
    public Optional<SessionEntity> findLatestSession(String principalName) {
        List<SessionEntity> allSessions = sessionRepository.findByPrincipalName(principalName);
        if (allSessions.isEmpty()) {
            return Optional.empty();
        }

        // Sort sessions by lastRequest in descending order
        allSessions.sort((s1, s2) -> s2.getLastRequest().compareTo(s1.getLastRequest()));

        // The first session in the list is the latest session for the given principal name
        return Optional.of(allSessions.getFirst());
    }
}
