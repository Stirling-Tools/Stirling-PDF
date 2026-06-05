package stirling.software.saas.payg.job;

import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Auto-closes {@code OPEN} jobs whose {@code last_step_at} is older than the workflow window. Runs
 * every minute. API users never have to call {@code close()} explicitly — this scheduler is the
 * safety net.
 *
 * <p>Single-fire only at V1: not {@code @SchedulerLock}'d, consistent with the other
 * {@code @Scheduled} tasks in {@code :saas} (none of them are guarded against multi-pod
 * double-fires today either). Multi-pod cluster-correctness for all schedulers is tracked in design
 * § 9 as a separate cleanup. The underlying {@code closeStale()} call is idempotent — duplicate
 * firings read an empty stale set on the second pod, no data corruption risk.
 */
@Component
@Profile("saas")
@RequiredArgsConstructor
@Slf4j
public class StaleJobCloser {

    private final JobService jobService;

    @Scheduled(fixedRateString = "${payg.job.stale-close-interval-ms:60000}")
    public void closeStale() {
        int closed = jobService.closeStale();
        if (closed > 0) {
            log.info("StaleJobCloser closed {} job(s) idle past the workflow window.", closed);
        }
    }
}
