package stirling.software.saas.payg.lineage;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Deletes {@code job_artifact_hash} rows older than the configured retention window. The workflow
 * window is 5 minutes; we keep an extra hour of headroom as a safety margin (covers clock skew,
 * in-flight requests, brief outages of this scheduler). Runs hourly.
 *
 * <p>Like {@link stirling.software.saas.payg.job.StaleJobCloser}, this is not
 * {@code @SchedulerLock}'d — duplicate firings on multi-pod deploys would both run a {@code DELETE
 * WHERE created_at < cutoff}, the second seeing zero rows to delete. Idempotent, wasted IO at
 * worst.
 */
@Component
@Profile("saas")
@Slf4j
public class LineagePruneScheduler {

    private final JobLineageStore store;
    private final Duration retention;

    public LineagePruneScheduler(
            JobLineageStore store, @Value("${payg.lineage.retention:PT1H}") Duration retention) {
        this.store = Objects.requireNonNull(store, "store");
        Objects.requireNonNull(retention, "retention");
        if (retention.isNegative() || retention.isZero()) {
            throw new IllegalArgumentException(
                    "payg.lineage.retention must be positive, got " + retention);
        }
        this.retention = retention;
    }

    @Scheduled(cron = "${payg.lineage.prune-cron:0 0 * * * *}", zone = "UTC")
    public void prune() {
        Instant cutoff = Instant.now().minus(retention);
        int deleted = store.pruneOlderThan(cutoff);
        if (deleted > 0) {
            log.info(
                    "LineagePruneScheduler deleted {} job_artifact_hash row(s) older than {}.",
                    deleted,
                    cutoff);
        }
    }
}
