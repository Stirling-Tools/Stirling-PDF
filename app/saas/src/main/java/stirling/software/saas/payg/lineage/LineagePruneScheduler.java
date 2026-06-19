package stirling.software.saas.payg.lineage;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import io.quarkus.arc.profile.IfBuildProfile;
import io.quarkus.scheduler.Scheduled;

import jakarta.enterprise.context.ApplicationScoped;

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
@ApplicationScoped
@IfBuildProfile("saas")
@Slf4j
public class LineagePruneScheduler {

    private final JobLineageStore store;
    private final Duration retention;

    public LineagePruneScheduler(
            JobLineageStore store,
            @ConfigProperty(name = "payg.lineage.retention", defaultValue = "PT1H")
                    Duration retention) {
        this.store = Objects.requireNonNull(store, "store");
        Objects.requireNonNull(retention, "retention");
        if (retention.isNegative() || retention.isZero()) {
            throw new IllegalArgumentException(
                    "payg.lineage.retention must be positive, got " + retention);
        }
        this.retention = retention;
    }

    // TODO: Migration required - Spring 6-field cron "0 0 * * * *" (top of every hour) translated
    // to
    // Quartz cron "0 0 * ? * *" (day-of-month set to ? per Quartz day-of-week/day-of-month
    // mutual-exclusion). Configurability is preserved via the {payg.lineage.prune-cron} config
    // expression; set that property to a Quartz-syntax cron (default below) to override.
    @Scheduled(cron = "{payg.lineage.prune-cron:0 0 * ? * *}", timeZone = "UTC")
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
