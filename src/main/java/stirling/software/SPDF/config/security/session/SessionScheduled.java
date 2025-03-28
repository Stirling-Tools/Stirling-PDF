package stirling.software.SPDF.config.security.session;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.List;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class SessionScheduled {

    private final SessionPersistentRegistry sessionPersistentRegistry;
    private final boolean loginEnabledValue;

    public SessionScheduled(
            SessionPersistentRegistry sessionPersistentRegistry,
            @Qualifier("loginEnabled") boolean loginEnabledValue) {
        this.sessionPersistentRegistry = sessionPersistentRegistry;
        this.loginEnabledValue = loginEnabledValue;
    }

    @Scheduled(cron = "0 0/1 * * * ?")
    public void expireSessions() {
        Instant now = Instant.now();
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        for (Object principal : sessionPersistentRegistry.getAllPrincipals()) {
            if (principal == null) {
                continue;
            } else if (principal instanceof String stringPrincipal) {
                // Skip anonymousUser if login is enabled
                if ("anonymousUser".equals(stringPrincipal) && loginEnabledValue) {
                    sessionPersistentRegistry.expireAllSessionsByPrincipalName(stringPrincipal);
                    continue;
                }
            }
            List<SessionInformation> sessionInformations =
                    sessionPersistentRegistry.getAllSessions(principal, false);
            for (SessionInformation sessionInformation : sessionInformations) {
                Date lastRequest = sessionInformation.getLastRequest();
                int maxInactiveInterval = sessionPersistentRegistry.getMaxInactiveInterval();
                Instant expirationTime =
                        lastRequest.toInstant().plus(maxInactiveInterval, ChronoUnit.SECONDS);
                if (now.isAfter(expirationTime)) {
                    sessionPersistentRegistry.expireSession(sessionInformation.getSessionId());
                    sessionInformation.expireNow();
                    if (authentication != null && principal.equals(authentication.getPrincipal())) {
                        authentication.setAuthenticated(false);
                    }
                    SecurityContextHolder.clearContext();
                    log.debug(
                            "Session expired for principal: {} SessionID: {}",
                            principal,
                            sessionInformation.getSessionId());
                }
            }
        }
    }
}
