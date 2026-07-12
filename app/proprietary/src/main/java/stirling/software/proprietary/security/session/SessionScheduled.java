package stirling.software.proprietary.security.session;

import java.time.Duration;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class SessionScheduled {

    // How long an expired session is retained before it is purged, keeping the table bounded.
    private static final Duration EXPIRED_SESSION_RETENTION = Duration.ofDays(30);

    private final SessionPersistentRegistry sessionPersistentRegistry;

    @Scheduled(cron = "0 0/5 * * * ?")
    public void expireSessions() {
        // One bulk UPDATE flags every timed-out session; one bulk DELETE purges long-dead rows.
        // Replaces the previous per-principal, per-session nested loop.
        sessionPersistentRegistry.expireStaleSessions();
        sessionPersistentRegistry.purgeExpiredSessions(EXPIRED_SESSION_RETENTION);
    }
}
