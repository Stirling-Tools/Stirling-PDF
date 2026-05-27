package stirling.software.saas.service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.Optional;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import net.javacrumbs.shedlock.core.LockConfiguration;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.core.SimpleLock;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.config.CreditsProperties;

@Service
@Profile("saas")
@Slf4j
public class CreditResetScheduler {

    /**
     * Lock name shared across the scheduled cron and the application-ready catch-up. They do the
     * same work (reset cycle credits) so a single lock dedupes them against each other when a pod
     * boots inside the cron window.
     */
    private static final String CYCLE_RESET_LOCK = "creditCycleReset";

    private final CreditService creditService;
    private final CreditsProperties creditsProperties;
    private final LockProvider lockProvider;

    public CreditResetScheduler(
            CreditService creditService,
            CreditsProperties creditsProperties,
            LockProvider lockProvider) {
        this.creditService = creditService;
        this.creditsProperties = creditsProperties;
        this.lockProvider = lockProvider;
    }

    /**
     * Reset cycle credits for all users and teams on the 1st of each month at 2 AM UTC. Runs
     * monthly; allocations are derived from user roles and team plan.
     *
     * <p>Single-leader across the cluster via {@link SchedulerLock} — only one instance fires the
     * reset per scheduled tick. {@code lockAtMostFor = 15m} bounds the lock if the holder crashes
     * mid-job; the reset is typically seconds, so 15 minutes is comfortable headroom. {@code
     * lockAtLeastFor = 30s} stops a fast retry from re-firing in a clock-skewed instance.
     *
     * <p>Belt-and-braces: even if the lock fails (provider outage, partition), the underlying
     * {@code findCreditsNeedingCycleReset(lastScheduledReset)} query filters on {@code
     * lastCycleResetAt &lt; :resetTime}, so a second runner won't re-reset rows the first runner
     * already touched. The lock prevents duplicate ledger entries (and duplicate cycle-reset
     * counter increments) that the row-level filter doesn't protect against.
     */
    @Scheduled(cron = "${credits.reset.cron:0 0 2 1 * *}", zone = "${credits.reset.zone:UTC}")
    @SchedulerLock(name = CYCLE_RESET_LOCK, lockAtMostFor = "PT15M", lockAtLeastFor = "PT30S")
    public void resetCycleCredits() {
        log.info(
                "Starting monthly credit reset for all users and teams (schedule: {}, zone: {})",
                creditsProperties.getReset().getCron(),
                creditsProperties.getReset().getZone());

        try {
            ZoneId configuredZone = ZoneId.of(creditsProperties.getReset().getZone());
            LocalDateTime resetTime = LocalDateTime.now(configuredZone);
            creditService.resetCycleCreditsForAllUsers(resetTime);
            creditService.resetCycleCreditsForAllTeams(resetTime);
            log.info("Monthly credit reset completed successfully at {}", resetTime);
        } catch (Exception e) {
            log.error("Error during monthly credit reset", e);
        }
    }

    /**
     * Check for missed resets on application startup.
     *
     * <p>Acquires {@link #CYCLE_RESET_LOCK} programmatically because ShedLock's
     * {@code @SchedulerLock} annotation advice only wraps {@code @Scheduled} methods — it would
     * silently no-op on an {@code @EventListener}. We need the lock here so a multi-pod boot
     * doesn't have every pod scan the whole credit table in parallel.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        LockConfiguration lockConfig =
                new LockConfiguration(
                        Instant.now(),
                        CYCLE_RESET_LOCK,
                        Duration.ofMinutes(15),
                        Duration.ofSeconds(30));

        Optional<SimpleLock> heldLock = lockProvider.lock(lockConfig);
        if (heldLock.isEmpty()) {
            log.info(
                    "Skipping catch-up cycle credit reset: another instance is holding the {} lock"
                            + " (this is the normal multi-pod boot case).",
                    CYCLE_RESET_LOCK);
            return;
        }

        try {
            ZoneId configuredZone = ZoneId.of(creditsProperties.getReset().getZone());
            LocalDateTime now = LocalDateTime.now(configuredZone);
            LocalDateTime lastScheduledReset = getMostRecentScheduledReset(now, configuredZone);

            log.info(
                    "Checking for missed cycle credit resets. Last scheduled: {}, Current: {}",
                    lastScheduledReset,
                    now);

            creditService.resetCycleCreditsForAllUsers(lastScheduledReset);
            creditService.resetCycleCreditsForAllTeams(lastScheduledReset);
            log.info("Catch-up cycle credit reset completed");
        } catch (Exception e) {
            log.error("Error during catch-up credit reset", e);
        } finally {
            heldLock.get().unlock();
        }
    }

    /** Get the most recent scheduled reset time based on configured schedule and zone */
    private LocalDateTime getMostRecentScheduledReset(LocalDateTime now, ZoneId configuredZone) {
        ZonedDateTime zonedNow = now.atZone(configuredZone);

        // Find the 1st of the current month at the configured time (default 02:00)
        ZonedDateTime firstOfMonth =
                zonedNow.with(TemporalAdjusters.firstDayOfMonth())
                        .withHour(2)
                        .withMinute(0)
                        .withSecond(0)
                        .withNano(0);

        // If it's the 1st and before the reset hour, or if current time is before the 1st at 2 AM,
        // go to previous month's 1st
        if (zonedNow.isBefore(firstOfMonth)) {
            firstOfMonth = firstOfMonth.minusMonths(1);
        }

        return firstOfMonth.toLocalDateTime();
    }

    /**
     * Cleanup and maintenance task; runs daily at 3 AM UTC. Performs maintenance tasks like
     * cleaning up old data. Independent lock from the cycle reset since the work doesn't overlap.
     */
    @Scheduled(cron = "0 0 3 * * *", zone = "UTC")
    @SchedulerLock(
            name = "creditDailyMaintenance",
            lockAtMostFor = "PT10M",
            lockAtLeastFor = "PT30S")
    public void performDailyMaintenance() {
        log.debug("Starting daily credit system maintenance");

        try {
            // API call history cleanup is no longer needed; audit system handles this
            log.debug("Daily credit system maintenance completed");
        } catch (Exception e) {
            log.error("Error during daily credit system maintenance", e);
        }
    }
}
