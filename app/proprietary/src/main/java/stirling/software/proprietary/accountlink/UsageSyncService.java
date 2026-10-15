package stirling.software.proprietary.accountlink;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.EnumMap;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.locks.ReentrantLock;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.config.FixedDelayTask;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.billing.BillingCategory;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

/**
 * Daily usage sender for combined billing. Reports each period's cumulative per-category usage to
 * SaaS, which bills the delta against its own last-seen totals.
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
        name = "stirling.billing.account-link.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class UsageSyncService implements SchedulingConfigurer {

    // First run waits out startup churn; then every interval.
    private static final Duration INITIAL_DELAY = Duration.ofMinutes(5);

    private final UsageCounterRepository counters;
    private final AccountLinkSyncStateRepository syncState;
    private final DeviceCredentialStore credentialStore;
    private final AccountLinkClient client;
    private final EntitlementCache entitlementCache;
    private final AccountLinkProperties properties;
    private final ApplicationEventPublisher events;
    private final ObjectProvider<UserService> users;
    private final UserLicenseSettingsService licenseSettings;

    /**
     * Serializes syncs to preserve report sequence ordering. A lock rather than {@code
     * synchronized} so a requested sync can decline to queue behind one already running.
     */
    private final ReentrantLock lock = new ReentrantLock();

    /**
     * When the last sync started, on the monotonic clock so the throttle survives a system clock
     * that moves. Null until the first one runs; in memory on purpose, a throttle being a bound on
     * load rather than state worth persisting.
     */
    private volatile Long lastStartedNanos;

    public UsageSyncService(
            UsageCounterRepository counters,
            AccountLinkSyncStateRepository syncState,
            DeviceCredentialStore credentialStore,
            AccountLinkClient client,
            EntitlementCache entitlementCache,
            AccountLinkProperties properties,
            ApplicationEventPublisher events,
            ObjectProvider<UserService> users,
            UserLicenseSettingsService licenseSettings) {
        this.counters = counters;
        this.syncState = syncState;
        this.credentialStore = credentialStore;
        this.client = client;
        this.entitlementCache = entitlementCache;
        this.properties = properties;
        this.events = events;
        this.users = users;
        this.licenseSettings = licenseSettings;
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

    /** Outcome of a {@link #requestSync}, so a caller can tell a run from a refusal. */
    public record SyncRequest(boolean ran, long retryAfterSeconds) {}

    /**
     * Runs a sync on request, declining one that a recent sync already covers.
     *
     * <p>The throttle is what keeps a reloaded billing page from turning every load into a report:
     * the page asks on open, and the answer for the next minute is that the figures it would have
     * fetched are already there. A sync already under way declines for the same reason, and without
     * queueing — waiting would hold the request open for the length of both.
     *
     * <p>It bounds attempts, not successes. An instance that cannot reach SaaS fails slowly, and
     * throttling on the outcome would make exactly that case the one a reload could repeat freely.
     *
     * @param force runs regardless — for an operator asking explicitly, which is what a "Sync now"
     *     control sends. {@link #syncNow()} remains the unthrottled call for the scheduler and for
     *     linking, neither of which is reachable by repetition.
     */
    public SyncRequest requestSync(boolean force) {
        long window = throttleWindowNanos();
        if (!force) {
            long remaining = remainingNanos(window);
            if (remaining > 0) {
                return new SyncRequest(false, secondsCeil(remaining));
            }
        }
        if (!lock.tryLock()) {
            return new SyncRequest(false, secondsCeil(window));
        }
        try {
            syncNow();
        } finally {
            lock.unlock();
        }
        return new SyncRequest(true, 0);
    }

    private long throttleWindowNanos() {
        Duration configured = properties.getMetering().getManualSyncThrottle();
        return configured == null ? 0 : Math.max(0, configured.toNanos());
    }

    /** Nanos left in the window, or 0 when none is running. Never negative. */
    private long remainingNanos(long window) {
        Long started = lastStartedNanos;
        if (started == null || window <= 0) {
            return 0;
        }
        long remaining = window - (System.nanoTime() - started);
        return Math.max(0, remaining);
    }

    /** At least 1, so a live throttle never advertises an immediate retry. */
    private static long secondsCeil(long nanos) {
        return Math.max(1, Duration.ofNanos(nanos).plusNanos(999_999_999L).toSeconds());
    }

    /**
     * Reports every period with unsynced usage and refreshes the cached entitlement from the reply.
     * Serializes link, manual and scheduled calls to preserve report sequence ordering. Also
     * reports seats when no credits are pending; no-op when unlinked.
     */
    public void syncNow() {
        lock.lock();
        try {
            lastStartedNanos = System.nanoTime();
            runSync();
        } finally {
            lock.unlock();
        }
    }

    private void runSync() {
        Optional<DeviceCredential> cred = credentialStore.get();
        if (cred.isEmpty()) {
            return; // not linked
        }
        UserService localUsers = users.getIfAvailable();
        if (localUsers == null) return;
        int seatCount =
                licenseSettings.hasLicenseKeyPaidTier()
                        ? 0
                        : Math.toIntExact(localUsers.getTotalUsersCount());
        List<LocalDateTime> periods =
                properties.getMetering().isEnabled()
                        ? counters.findPeriodsWithUnsyncedUsage()
                        : List.of();
        InstanceEntitlement latest = null;
        try {
            if (periods.isEmpty()) {
                latest =
                        client.reportUsage(
                                cred.get().getDeviceId(),
                                cred.get().getDeviceSecret(),
                                0,
                                null,
                                0,
                                0,
                                0,
                                seatCount);
            }
            for (LocalDateTime period : periods) {
                InstanceEntitlement fresh = syncPeriod(cred.get(), period, seatCount);
                if (fresh != null) {
                    latest = fresh;
                }
            }
        } catch (AccountLinkClient.RevokedException e) {
            entitlementCache.accept(
                    cred.get().getDeviceId(),
                    new InstanceEntitlement(false, 0, 0, 0L, EntitlementState.REVOKED));
            events.publishEvent(new EntitlementRefreshedEvent());
            return;
        }
        // Adopt the freshest entitlement the sync returned, saving the cache a redundant fetch.
        entitlementCache.accept(cred.get().getDeviceId(), latest);
        if (latest != null) {
            // Only when a reply actually arrived. accept() no-ops on null, so announcing a refresh
            // here would tell listeners the plan had been re-read when every period had failed.
            events.publishEvent(new EntitlementRefreshedEvent());
        }
    }

    /** Reports one period; returns the fresh entitlement, or null on a transport/server failure. */
    private InstanceEntitlement syncPeriod(
            DeviceCredential cred, LocalDateTime period, int seatCount) {
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
                        cumulative.getOrDefault(BillingCategory.AUTOMATION, 0L),
                        seatCount);
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
