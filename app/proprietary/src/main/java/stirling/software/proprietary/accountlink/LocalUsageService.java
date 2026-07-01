package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

/**
 * Reads this instance's <b>locally accrued but not-yet-synced</b> usage for the current period
 * (combined-billing "Mode A"). The portal adds this on top of the SaaS-synced spend so "current
 * usage" reflects work done since the last daily sync, not just what SaaS has already billed.
 *
 * <p>Unsynced per category = {@code cumulativeUnits − lastSyncedUnits} (floored at 0). Scoped to
 * the entitlement's current period so prior-period leftovers (reported separately on rollover)
 * don't inflate the current figure. Returns zeros when the period is unknown or metering is off (no
 * counters accrue).
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
        long api = 0;
        long ai = 0;
        long automation = 0;
        for (UsageCounter c : counters.findByPeriodStart(period)) {
            long unsynced = Math.max(0, c.getCumulativeUnits() - c.getLastSyncedUnits());
            switch (c.getCategory()) {
                case "API" -> api = unsynced;
                case "AI" -> ai = unsynced;
                case "AUTOMATION" -> automation = unsynced;
                default -> {
                    // BYPASSED never accrues; ignore any unexpected category.
                }
            }
        }
        return new LocalUsage(period, api, ai, automation, api + ai + automation);
    }
}
