package stirling.software.saas.service;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.config.CreditsProperties;

@Service
@Profile("saas")
@Slf4j
@RequiredArgsConstructor
public class CreditResetScheduler {

    private final CreditService creditService;
    private final CreditsProperties creditsProperties;

    /**
     * Reset cycle credits for all users and teams on the 1st of each month at 2 AM UTC This runs
     * monthly, resetting credits based on user roles and team seats
     */
    @Scheduled(cron = "${credits.reset.cron:0 0 2 1 * *}", zone = "${credits.reset.zone:UTC}")
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

    /** Check for missed resets on application startup */
    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
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
     * cleaning up old data.
     */
    @Scheduled(cron = "0 0 3 * * *", zone = "UTC")
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
