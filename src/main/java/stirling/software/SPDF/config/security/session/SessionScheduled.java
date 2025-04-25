package stirling.software.SPDF.config.security.session;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.List;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

@Component
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
