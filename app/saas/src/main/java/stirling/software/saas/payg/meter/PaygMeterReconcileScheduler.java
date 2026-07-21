package stirling.software.saas.payg.meter;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.repository.PaygMeterEventLogRepository;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;

/**
 * Retries PAYG meter events that were logged but never confirmed posted to Stripe — the durability
 * half of the fail-open meter path. {@link PaygMeterReportingService} writes a pending {@code
 * payg_meter_event_log} row before each POST and stamps it on success; anything left unposted
 * (Stripe blip, pod crash between POST and stamp, edge-fn outage) is picked up here and re-sent
 * under the <em>same</em> idempotency key, so Stripe dedups rather than double-charging.
 *
 * <p>Only retries rows inside Stripe's 24h idempotency window — past that a same-key retry is no
 * longer guaranteed to dedup, so stuck rows are logged for manual reconciliation rather than
 * risking a double charge. Skips teams that have since unsubscribed (nothing to bill). Like {@link
 * stirling.software.saas.payg.lineage.LineagePruneScheduler} it is not {@code @SchedulerLock}'d: a
 * duplicate firing on a multi-pod deploy re-sends the same keys, which dedup at Stripe —
 * idempotent, wasted IO at worst.
 */
@Component
@Profile("saas")
@Slf4j
public class PaygMeterReconcileScheduler {

    /** Stripe's meter-event idempotency window — a same-key retry past this may double-charge. */
    private static final Duration STRIPE_IDEMPOTENCY_WINDOW = Duration.ofHours(24);

    private final PaygMeterEventLogRepository eventLogRepository;
    private final PaygTeamExtensionsRepository teamExtensionsRepository;
    private final PaygMeterReportingService meterReportingService;
    private final boolean enabled;
    private final Duration retryDelay;
    private final int batchSize;
    private final Counter retriedCounter;

    public PaygMeterReconcileScheduler(
            PaygMeterEventLogRepository eventLogRepository,
            PaygTeamExtensionsRepository teamExtensionsRepository,
            PaygMeterReportingService meterReportingService,
            @Value("${payg.meter.reconcile.enabled:true}") boolean enabled,
            @Value("${payg.meter.reconcile.retry-delay:PT5M}") Duration retryDelay,
            @Value("${payg.meter.reconcile.batch-size:100}") int batchSize,
            MeterRegistry meterRegistry) {
        this.eventLogRepository = Objects.requireNonNull(eventLogRepository, "eventLogRepository");
        this.teamExtensionsRepository =
                Objects.requireNonNull(teamExtensionsRepository, "teamExtensionsRepository");
        this.meterReportingService =
                Objects.requireNonNull(meterReportingService, "meterReportingService");
        this.enabled = enabled;
        this.retryDelay = Objects.requireNonNull(retryDelay, "retryDelay");
        this.batchSize = batchSize > 0 ? batchSize : 100;
        this.retriedCounter =
                Counter.builder("payg.meter.reconcile.retried")
                        .description("PAYG meter events re-posted to Stripe by the reconcile job")
                        .register(meterRegistry);
    }

    @Scheduled(cron = "${payg.meter.reconcile-cron:0 */15 * * * *}", zone = "UTC")
    public void reconcile() {
        if (!enabled) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        // Give the live POST a moment to land before retrying; stay inside the 24h dedup window.
        LocalDateTime cutoff = now.minus(retryDelay);
        LocalDateTime floor = now.minus(STRIPE_IDEMPOTENCY_WINDOW);

        List<PaygMeterEventLog> retryable =
                eventLogRepository.findRetryable(cutoff, floor, PageRequest.of(0, batchSize));

        // Batch-fetch this page's team extensions in one query (keyed by team id) rather than a
        // findById per row — avoids an N+1 when the page spans several teams.
        List<Long> teamIds =
                retryable.stream().map(PaygMeterEventLog::getTeamId).distinct().toList();
        Map<Long, PaygTeamExtensions> extById =
                teamExtensionsRepository.findAllById(teamIds).stream()
                        .collect(Collectors.toMap(PaygTeamExtensions::getTeamId, ext -> ext));

        int retried = 0;
        for (PaygMeterEventLog row : retryable) {
            PaygTeamExtensions ext = extById.get(row.getTeamId());
            if (ext == null) {
                continue;
            }
            String subscriptionId = ext.getPaygSubscriptionId();
            String stripeCustomerId = ext.getStripeCustomerId();
            if (subscriptionId == null
                    || subscriptionId.isBlank()
                    || stripeCustomerId == null
                    || stripeCustomerId.isBlank()) {
                // Team unsubscribed since the event was logged — nothing to bill; leave the row.
                continue;
            }
            // Same idempotency key → Stripe dedups if the original actually landed. recordUsage
            // re-inserts pending as a no-op, re-POSTs, and stamps the row on success. Category is
            // not re-derived (analytics metadata only); units + key are what bill.
            meterReportingService.recordUsage(
                    row.getTeamId(),
                    stripeCustomerId,
                    row.getUnits() == null ? 0 : row.getUnits(),
                    null,
                    row.getIdempotencyKey(),
                    row.getJobId());
            retried++;
        }
        if (retried > 0) {
            retriedCounter.increment(retried);
            log.info("PaygMeterReconcileScheduler retried {} unposted meter event(s).", retried);
        }

        long stuck = eventLogRepository.countStuck(floor);
        if (stuck > 0) {
            log.warn(
                    "{} PAYG meter event(s) stuck unposted past Stripe's {}h idempotency window —"
                            + " manual reconciliation needed.",
                    stuck,
                    STRIPE_IDEMPOTENCY_WINDOW.toHours());
        }
    }
}
