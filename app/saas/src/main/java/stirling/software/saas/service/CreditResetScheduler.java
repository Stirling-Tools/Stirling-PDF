package stirling.software.saas.service;

import java.time.LocalDateTime;
import java.time.ZoneId;

import org.springframework.context.annotation.Profile;
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

    // NOTE: The startup catch-up reset (formerly @EventListener(ApplicationReadyEvent)) was
    // removed. It bulk-looped every user on each boot (per-row save), hammering the DB and
    // stalling boot on large user tables. Per-user cycle resets already happen lazily in
    // CreditService.getOrCreateUserCredits (isCycleResetDue), and the monthly cron above still
    // performs the scheduled reset.

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
