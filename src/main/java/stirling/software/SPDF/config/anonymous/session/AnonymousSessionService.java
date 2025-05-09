package stirling.software.SPDF.config.anonymous.session;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class AnonymousSessionService {

    @Autowired private AnonymousSessionListener sessionRegistry;

    @Value("${server.servlet.session.timeout:30m}")
    private Duration defaultMaxInactiveInterval;

    // Runs every minute to expire inactive sessions
    @Scheduled(cron = "0 0/5 * * * ?")
    public void expireSessions() {
        Instant now = Instant.now();
        sessionRegistry.getAllSessions().stream()
                .filter(session -> !session.isExpired())
                .forEach(
                        session -> {
                            Date lastRequest = session.getLastRequest();
                            int maxInactiveInterval = (int) defaultMaxInactiveInterval.getSeconds();
                            Instant expirationTime =
                                    lastRequest
                                            .toInstant()
                                            .plus(maxInactiveInterval, ChronoUnit.SECONDS);

                            if (now.isAfter(expirationTime)) {
                                log.debug("Session expiration triggered");
                                sessionRegistry.expireSession(session.getSessionId());
                            }
                        });
    }
}
