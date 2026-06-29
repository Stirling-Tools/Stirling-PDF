package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.billing.BillingCategory;

/**
 * Accrues metered usage into the durable per-(period, category) {@link UsageCounter} on the
 * instance. The daily sync later reports the cumulative totals to SaaS.
 *
 * <p>Gated behind the dedicated {@code stirling.billing.account-link.metering.enabled} switch (on
 * top of {@code @Profile("!saas")}), so the bean is absent — and nothing accrues — unless billing
 * is explicitly turned on. {@link #accrue} is best-effort and self-contained: callers (the gate
 * interceptor's success path) need not handle persistence errors.
 */
@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(
        name = "stirling.billing.account-link.metering.enabled",
        havingValue = "true")
public class UsageMeterService {

    private final UsageCounterRepository repo;

    public UsageMeterService(UsageCounterRepository repo) {
        this.repo = repo;
    }

    /**
     * Adds {@code units} to the {@code (periodStart, category)} counter, creating the row on first
     * use. Atomic increment-or-insert: an UPDATE first, falling back to an INSERT, and on a lost
     * insert race a second increment. No-ops for non-billable categories, non-positive units, or a
     * missing period (e.g. entitlement not yet synced).
     */
    public void accrue(LocalDateTime periodStart, BillingCategory category, long units) {
        if (periodStart == null
                || category == null
                || category == BillingCategory.BYPASSED
                || units <= 0) {
            return;
        }
        String cat = category.name();
        LocalDateTime now = LocalDateTime.now();
        try {
            if (repo.increment(periodStart, cat, units, now) > 0) {
                return;
            }
            try {
                repo.saveAndFlush(new UsageCounter(periodStart, cat, units, now));
            } catch (DataIntegrityViolationException raceLostInsert) {
                // A concurrent request inserted the row first — increment the now-existing row.
                repo.increment(periodStart, cat, units, now);
            }
        } catch (RuntimeException e) {
            // Metering must never break the request it rode in on; lost accrual self-heals on the
            // next operation's increment, and the daily sync reports the cumulative total either
            // way.
            log.debug("Usage accrual failed for {}/{}: {}", periodStart, cat, e.getMessage());
        }
    }
}
