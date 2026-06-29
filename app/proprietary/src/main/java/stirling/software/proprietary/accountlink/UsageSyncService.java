package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Daily usage sender for combined-billing "Mode A". Reports each period's cumulative per-category
 * usage to SaaS, which bills the delta against its own last-seen totals.
 *
 * <p>The model is deliberately resilient: the sync seq is reserved (persisted) <em>before</em> the
 * report so it never regresses across restarts/failures; a transport failure leaves the per-counter
 * {@code lastSyncedUnits} markers untouched so the usage simply rolls into the next sync; and
 * reporting the same cumulative twice bills nothing (SaaS dedups on the delta + seq). All periods
 * with unsynced usage are reported, not just the current one, so usage isn't stranded when the
 * billing period rolls over between syncs.
 *
 * <p>Gated behind the dedicated {@code stirling.billing.account-link.metering.enabled} switch (plus
 * {@code @Profile("!saas")}): off → bean absent → nothing syncs.
 */
@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(
        name = "stirling.billing.account-link.metering.enabled",
        havingValue = "true")
public class UsageSyncService {

    private final UsageCounterRepository counters;
    private final AccountLinkSyncStateRepository syncState;
    private final DeviceCredentialStore credentialStore;
    private final AccountLinkClient client;
    private final EntitlementCache entitlementCache;

    public UsageSyncService(
            UsageCounterRepository counters,
            AccountLinkSyncStateRepository syncState,
            DeviceCredentialStore credentialStore,
            AccountLinkClient client,
            EntitlementCache entitlementCache) {
        this.counters = counters;
        this.syncState = syncState;
        this.credentialStore = credentialStore;
        this.client = client;
        this.entitlementCache = entitlementCache;
    }

    // First run waits out startup (entitlement fetch + any restart churn); then every interval.
    @Scheduled(
            initialDelay = 300_000L,
            fixedDelayString =
                    "#{T(java.time.Duration).ofHours(${stirling.billing.account-link.metering.sync-interval-hours:24}).toMillis()}")
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
            return; // nothing accrued since the last successful sync
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
        long api = 0;
        long ai = 0;
        long automation = 0;
        for (UsageCounter c : counters.findByPeriodStart(period)) {
            switch (c.getCategory()) {
                case "API" -> api = c.getCumulativeUnits();
                case "AI" -> ai = c.getCumulativeUnits();
                case "AUTOMATION" -> automation = c.getCumulativeUnits();
                default -> {
                    // BYPASSED never accrues; ignore any unexpected category.
                }
            }
        }
        long seq = reserveNextSeq();
        InstanceEntitlement fresh =
                client.reportUsage(
                        cred.getDeviceId(),
                        cred.getDeviceSecret(),
                        seq,
                        period,
                        api,
                        ai,
                        automation);
        if (fresh == null) {
            // Transport/server failure: leave the synced markers; the burned seq is harmless (seqs
            // need only be monotonic) and SaaS bills the delta on the next successful sync.
            return null;
        }
        recordSuccess(period, api, ai, automation);
        return fresh;
    }

    /** Reserves and persists the next strictly-increasing sequence before the report goes out. */
    private long reserveNextSeq() {
        AccountLinkSyncState state = loadState();
        long next = state.getLastSyncSeq() + 1;
        state.setLastSyncSeq(next);
        syncState.save(state);
        return next;
    }

    /** Advances the per-counter synced markers to the reported totals + stamps the success time. */
    private void recordSuccess(LocalDateTime period, long api, long ai, long automation) {
        if (api > 0) {
            counters.markSynced(period, "API", api);
        }
        if (ai > 0) {
            counters.markSynced(period, "AI", ai);
        }
        if (automation > 0) {
            counters.markSynced(period, "AUTOMATION", automation);
        }
        AccountLinkSyncState state = loadState();
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
