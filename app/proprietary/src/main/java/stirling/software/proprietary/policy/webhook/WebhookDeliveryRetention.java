package stirling.software.proprietary.policy.webhook;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.ledger.ProcessedLedger;

/**
 * Bounds how long a failed delivery is kept. A successful run removes its delivery itself; one that
 * only ever fails would otherwise sit in storage indefinitely. Measured from the last failure, so a
 * retry that fails again gets a fresh window, and skipped while any policy still has the document
 * in flight, so a purge never pulls the bytes out from under a run.
 */
@Slf4j
@Service
public class WebhookDeliveryRetention {

    static final Duration RETENTION = Duration.ofDays(7);

    private final WebhookDeliveries deliveries;
    private final WebhookDeliveryStore store;
    private final ProcessedLedger ledger;
    private final Supplier<Long> nowMillis;

    @Autowired
    public WebhookDeliveryRetention(
            WebhookDeliveries deliveries, WebhookDeliveryStore store, ProcessedLedger ledger) {
        this(deliveries, store, ledger, System::currentTimeMillis);
    }

    WebhookDeliveryRetention(
            WebhookDeliveries deliveries,
            WebhookDeliveryStore store,
            ProcessedLedger ledger,
            Supplier<Long> nowMillis) {
        this.deliveries = deliveries;
        this.store = store;
        this.ledger = ledger;
        this.nowMillis = nowMillis;
    }

    @Scheduled(fixedDelay = 1, timeUnit = TimeUnit.DAYS)
    public void purgeExpiredFailures() {
        List<WebhookDelivery> expired = store.failedBefore(nowMillis.get() - RETENTION.toMillis());
        int purged = 0;
        for (WebhookDelivery delivery : expired) {
            if (ledger.inFlightAnywhere(delivery.identity())) {
                continue;
            }
            try {
                deliveries.discard(delivery);
                purged++;
            } catch (RuntimeException e) {
                log.warn(
                        "Could not purge expired webhook delivery {}: {}",
                        delivery.id(),
                        e.getMessage());
            }
        }
        if (purged > 0) {
            log.info(
                    "Purged {} webhook deliveries that failed more than {} ago", purged, RETENTION);
        }
    }
}
