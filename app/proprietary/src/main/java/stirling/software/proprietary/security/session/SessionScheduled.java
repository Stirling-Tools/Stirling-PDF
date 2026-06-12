package stirling.software.proprietary.security.session;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.List;

// TODO: Migration required - SessionInformation is a Spring Security type
// (org.springframework.security.core.session.SessionInformation) still returned by the
// not-yet-migrated collaborator SessionPersistentRegistry. Keep this import until that
// collaborator and the session-registry abstraction are migrated off Spring Security.
import org.springframework.security.core.session.SessionInformation;

import io.quarkus.scheduler.Scheduled;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;

@ApplicationScoped
@RequiredArgsConstructor
public class SessionScheduled {

    private final SessionPersistentRegistry sessionPersistentRegistry;

    @Scheduled(cron = "0 0/5 * * * ?")
    public void expireSessions() {
        Instant now = Instant.now();
        for (Object principal : sessionPersistentRegistry.getAllPrincipals()) {
            List<SessionInformation> sessionInformations =
                    sessionPersistentRegistry.getAllSessions(principal, false);
            for (SessionInformation sessionInformation : sessionInformations) {
                Date lastRequest = sessionInformation.getLastRequest();
                int maxInactiveInterval = sessionPersistentRegistry.getMaxInactiveInterval();
                Instant expirationTime =
                        lastRequest.toInstant().plus(maxInactiveInterval, ChronoUnit.SECONDS);
                if (now.isAfter(expirationTime)) {
                    sessionPersistentRegistry.expireSession(sessionInformation.getSessionId());
                }
            }
        }
    }
}
