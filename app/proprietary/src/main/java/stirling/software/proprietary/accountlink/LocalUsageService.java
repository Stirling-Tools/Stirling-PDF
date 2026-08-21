package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;
import java.util.EnumMap;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import stirling.software.proprietary.billing.BillingCategory;

/**
 * Reads this instance's locally accrued but not-yet-synced usage for the current period. The portal
 * adds this on top of SaaS-synced spend so "current usage" reflects work done since the last sync.
 *
 * <p>Unsynced per category = {@code cumulativeUnits − lastSyncedUnits} (floored at 0), scoped to
 * the current period so prior-period leftovers don't inflate it. Zeros when the period is unknown
 * or metering is off.
 */
@Service
@Profile("!saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class LocalUsageService {

    private final UsageCounterRepository counters;
    private final EntitlementCache entitlementCache;

    public LocalUsageService(UsageCounterRepository counters, EntitlementCache entitlementCache) {
        this.counters = counters;
        this.entitlementCache = entitlementCache;
    }

    /** Per-category unsynced units for the current period; {@code periodStart} null = unknown. */
    public record LocalUsage(
            LocalDateTime periodStart,
            long apiUnsyncedUnits,
            long aiUnsyncedUnits,
            long automationUnsyncedUnits,
            long totalUnsyncedUnits) {}

    public LocalUsage currentPeriodUnsynced() {
        LocalDateTime period =
                entitlementCache.current().map(InstanceEntitlement::periodStart).orElse(null);
        if (period == null) {
            return new LocalUsage(null, 0, 0, 0, 0);
        }
        EnumMap<BillingCategory, Long> unsynced = new EnumMap<>(BillingCategory.class);
        for (UsageCounter c : counters.findByPeriodStart(period)) {
            BillingCategory cat = c.billingCategory();
            if (cat != null && cat != BillingCategory.BYPASSED) {
                unsynced.merge(cat, c.unsyncedUnits(), Long::sum);
            }
        }
        long api = unsynced.getOrDefault(BillingCategory.API, 0L);
        long ai = unsynced.getOrDefault(BillingCategory.AI, 0L);
        long automation = unsynced.getOrDefault(BillingCategory.AUTOMATION, 0L);
        return new LocalUsage(period, api, ai, automation, api + ai + automation);
    }
}
