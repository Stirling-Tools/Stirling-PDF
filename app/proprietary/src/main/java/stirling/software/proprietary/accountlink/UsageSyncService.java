package stirling.software.proprietary.accountlink;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.EnumMap;
import java.util.List;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.config.FixedDelayTask;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.billing.BillingCategory;

/**
 * Daily usage sender for combined-billing "Mode A". Reports each period's cumulative per-category
 * usage to SaaS, which bills the delta against its own last-seen totals.
 *
 * <p>Resilience: the sync seq is persisted before the report so it never regresses across
 * restarts/failures; a transport failure leaves the {@code lastSyncedUnits} markers untouched so
 * usage rolls into the next sync; and reporting the same cumulative twice bills nothing. All
 * periods with unsynced usage are reported so nothing is stranded when the period rolls over
 * between syncs.
 */
@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(
        name = "stirling.billing.account-link.metering.enabled",
        havingValue = "true")
public class UsageSyncService implements SchedulingConfigurer {

    // First run waits out startup churn; then every interval.
    private static final Duration INITIAL_DELAY = Duration.ofMinutes(5);

    private final UsageCounterRepository counters;
    private final AccountLinkSyncStateRepository syncState;
    private final DeviceCredentialStore credentialStore;
    private final AccountLinkClient client;
    private final EntitlementCache entitlementCache;
    private final AccountLinkProperties properties;

    public UsageSyncService(
            UsageCounterRepository counters,
            AccountLinkSyncStateRepository syncState,
            DeviceCredentialStore credentialStore,
            AccountLinkClient client,
            EntitlementCache entitlementCache,
            AccountLinkProperties properties) {
        this.counters = counters;
        this.syncState = syncState;
        this.credentialStore = credentialStore;
        this.client = client;
        this.entitlementCache = entitlementCache;
        this.properties = properties;
    }

    /**
     * Registers the daily sync, binding the interval from {@code metering.sync-interval-hours} in
     * code rather than a {@code @Scheduled} SpEL string so a bad interval fails at boot/test rather
     * than only on a flags-on run.
     */
    @Override
    public void configureTasks(ScheduledTaskRegistrar registrar) {
        Duration interval = Duration.ofHours(properties.getMetering().getSyncIntervalHours());
        registrar.addFixedDelayTask(
                new FixedDelayTask(this::scheduledSync, interval, INITIAL_DELAY));
    }

    public void scheduledSync() {
        try {
            syncNow();
        } catch (RuntimeException e) {
            log.debug("Scheduled usage sync failed", e);
        }
    }

    /**
     * Reports every period with unsynced usage and refreshes the cached entitlement from the reply.
     * Single daily caller (non-reentrant {@code fixedDelay}), so no internal locking. No-op when
     * unlinked or when nothing is pending.
     */
    public void syncNow() {
        Optional<DeviceCredential> cred = credentialStore.get();
        if (cred.isEmpty()) {
            return; // not linked
        }
        List<LocalDateTime> periods = counters.findPeriodsWithUnsyncedUsage();
        if (periods.isEmpty()) {
            // Nothing to report, but a sync is also our cue to pick up an out-of-band entitlement
            // change (e.g. the admin just subscribed) that otherwise wouldn't surface until the
            // cache TTL lapses. Force an immediate refresh so the gate reflects the new plan now.
            entitlementCache.invalidate();
            entitlementCache.current();
            return;
        }
        InstanceEntitlement latest = null;
        try {
            for (LocalDateTime period : periods) {
                InstanceEntitlement fresh = syncPeriod(cred.get(), period);
                if (fresh != null) {
                    latest = fresh;
                }
            }
        } catch (AccountLinkClient.RevokedException e) {
            // Authoritative deny — stop reporting; the entitlement cache blocks billable work on
            // its
            // own next refresh, so we don't synthesise the blocked state here.
            log.info(
                    "Usage sync denied (HTTP {}); credential revoked/invalid — gate blocks on next"
                            + " refresh",
                    e.status());
            return;
        }
        // Adopt the freshest entitlement the sync returned, saving the cache a redundant fetch.
        entitlementCache.accept(latest);
    }

    /** Reports one period; returns the fresh entitlement, or null on a transport/server failure. */
    private InstanceEntitlement syncPeriod(DeviceCredential cred, LocalDateTime period) {
        EnumMap<BillingCategory, Long> cumulative = new EnumMap<>(BillingCategory.class);
        for (UsageCounter c : counters.findByPeriodStart(period)) {
            BillingCategory cat = c.billingCategory();
            if (cat != null && cat != BillingCategory.BYPASSED) {
                cumulative.merge(cat, c.getCumulativeUnits(), Long::sum);
            }
        }
        AccountLinkSyncState state = loadState();
        long seq = reserveNextSeq(state);
        InstanceEntitlement fresh =
                client.reportUsage(
                        cred.getDeviceId(),
                        cred.getDeviceSecret(),
                        seq,
                        period,
                        cumulative.getOrDefault(BillingCategory.API, 0L),
                        cumulative.getOrDefault(BillingCategory.AI, 0L),
                        cumulative.getOrDefault(BillingCategory.AUTOMATION, 0L));
        if (fresh == null) {
            // Transport/server failure: leave the synced markers untouched. The burned seq is
            // harmless (seqs need only be monotonic) and the delta bills on the next successful
            // sync.
            return null;
        }
        recordSuccess(period, cumulative, state);
        return fresh;
    }

    /** Reserves and persists the next strictly-increasing sequence before the report goes out. */
    private long reserveNextSeq(AccountLinkSyncState state) {
        long next = state.getLastSyncSeq() + 1;
        state.setLastSyncSeq(next);
        syncState.save(state);
        return next;
    }

    /**
     * Advances the per-category synced markers to the reported totals + stamps the success time.
     */
    private void recordSuccess(
            LocalDateTime period,
            EnumMap<BillingCategory, Long> cumulative,
            AccountLinkSyncState state) {
        cumulative.forEach(
                (category, units) -> {
                    if (units > 0) {
                        counters.markSynced(period, category.name(), units);
                    }
                });
        state.setLastSuccessAt(LocalDateTime.now());
        syncState.save(state);
    }

    private AccountLinkSyncState loadState() {
        return syncState
                .findById(AccountLinkSyncState.SINGLETON_ID)
                .orElseGet(
                        () -> {
                            AccountLinkSyncState s = new AccountLinkSyncState();
                            s.setId(AccountLinkSyncState.SINGLETON_ID);
                            return s;
                        });
    }
}
