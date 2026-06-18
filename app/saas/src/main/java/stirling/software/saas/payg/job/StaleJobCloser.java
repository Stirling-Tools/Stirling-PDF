package stirling.software.saas.payg.job;

import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.charge.JobChargeService;

/**
 * Auto-closes {@code OPEN} jobs whose {@code last_step_at} is older than the workflow window. Runs
 * every minute. API users never have to call {@code close()} explicitly — this scheduler is the
 * safety net, and (for metered teams) the point at which the Stripe meter event is posted.
 *
 * <p>Each stale job is closed individually through {@link JobChargeService#close(java.util.UUID)}
 * rather than {@code JobService.closeStale()} (a bulk status flip). That routing matters: {@code
 * JobChargeService.close} registers the {@code afterCommit} hook that posts the billable usage to
 * Stripe via {@code PaygMeterReportingService}. A bulk flip would close the rows but never meter
 * them — usage would accrue in the wallet ledger yet never reach the customer's invoice.
 *
 * <p>Per-job transactions + failure isolation: each {@code chargeService.close(id)} runs in its own
 * transaction (cross-bean proxied call from this non-transactional scheduled method), so the
 * afterCommit meter POST fires once per job and one job's failure can't abort the rest of the
 * sweep. The meter event's idempotency key ({@code process:<id>:close}) makes a re-run on the next
 * tick safe even if a close half-completed.
 *
 * <p>Single-fire only at V1: not {@code @SchedulerLock}'d, consistent with the other
 * {@code @Scheduled} tasks in {@code :saas}. Multi-pod cluster-correctness for all schedulers is
 * tracked in design § 9 as a separate cleanup; the per-job close + meter idempotency key mean a
 * double-fire across pods reads a shrinking stale set and never double-bills.
 */
@Component
@Profile("saas")
@Slf4j
public class StaleJobCloser {

    private final JobService jobService;
    private final JobChargeService chargeService;

    public StaleJobCloser(JobService jobService, JobChargeService chargeService) {
        this.jobService = jobService;
        this.chargeService = chargeService;
    }

    @Scheduled(fixedRateString = "${payg.job.stale-close-interval-ms:60000}")
    public void closeStale() {
        List<ProcessingJob> stale = jobService.findStale();
        if (stale.isEmpty()) {
            return;
        }
        int closed = 0;
        for (ProcessingJob job : stale) {
            try {
                // Routes through the charge service so the afterCommit meter hook fires for
                // metered teams. Idempotent: a job already closed by a racing tick no-ops.
                chargeService.close(job.getId());
                closed++;
            } catch (RuntimeException e) {
                // Isolate per job — a single bad row (or a transient meter-path issue) must not
                // strand the rest of the stale set open. Next tick retries.
                log.warn("StaleJobCloser failed to close job {}: {}", job.getId(), e.getMessage());
            }
        }
        if (closed > 0) {
            log.info("StaleJobCloser closed {} job(s) idle past the workflow window.", closed);
        }
    }
}
