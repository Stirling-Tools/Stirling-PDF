package stirling.software.proprietary.security.session;

import java.time.Duration;

import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

import stirling.software.common.scheduling.LazyScheduledTask;

@Component
public class SessionScheduled {

    // Retention before an expired session is purged.
    private static final Duration EXPIRED_SESSION_RETENTION = Duration.ofDays(30);

    private static final String EXPIRY_CRON = "0 0/5 * * * ?";

    private final SessionPersistentRegistry sessionPersistentRegistry;
    private final LazyScheduledTask expiryTask;

    public SessionScheduled(
            SessionPersistentRegistry sessionPersistentRegistry, TaskScheduler scheduler) {
        this.sessionPersistentRegistry = sessionPersistentRegistry;
        this.expiryTask = new LazyScheduledTask(scheduler, this::expireSessions);
    }

    /** Registers the expiry sweep on the first session write. */
    public boolean ensureScheduled() {
        return expiryTask.ensureCron(EXPIRY_CRON);
    }

    /** Flags timed-out sessions, then purges long-dead ones. */
    public void expireSessions() {
        sessionPersistentRegistry.expireStaleSessions();
        sessionPersistentRegistry.purgeExpiredSessions(EXPIRED_SESSION_RETENTION);
    }
}
