package stirling.software.proprietary.security.session;

import java.time.Duration;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class SessionScheduled {

    // Retention before an expired session is purged.
    private static final Duration EXPIRED_SESSION_RETENTION = Duration.ofDays(30);

    private final SessionPersistentRegistry sessionPersistentRegistry;

    @Scheduled(cron = "0 0/5 * * * ?")
    public void expireSessions() {
        // Flag timed-out sessions, then purge long-dead ones.
        sessionPersistentRegistry.expireStaleSessions();
        sessionPersistentRegistry.purgeExpiredSessions(EXPIRED_SESSION_RETENTION);
    }
}
