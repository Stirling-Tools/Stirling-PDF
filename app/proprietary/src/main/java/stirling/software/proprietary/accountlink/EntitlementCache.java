package stirling.software.proprietary.accountlink;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Caches the linked team's entitlement so the request-time gate does not call the SaaS backend on
 * every billable request. Single-slot (one instance = one linked team), TTL-based.
 *
 * <p>Fail-open friendly: {@link #current()} returns the freshest snapshot it has, even if a refresh
 * just failed; it returns {@link Optional#empty()} only when nothing has ever been fetched
 * <i>and</i> the latest refresh failed. The gate treats empty as "unknown → allow".
 */
@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class EntitlementCache {

    private final DeviceCredentialStore credentialStore;
    private final AccountLinkClient client;
    private final Duration ttl;

    /** Entitlement + fetch time, swapped atomically as one value so readers never tear. */
    private record Snapshot(InstanceEntitlement entitlement, Instant fetchedAt) {}

    private static final Snapshot EMPTY = new Snapshot(null, Instant.EPOCH);

    private volatile Snapshot snapshot = EMPTY;

    /** Single-flight guard: one thread refreshes while others serve the current snapshot. */
    private final AtomicBoolean refreshing = new AtomicBoolean(false);

    public EntitlementCache(
            DeviceCredentialStore credentialStore,
            AccountLinkClient client,
            AccountLinkProperties properties) {
        this.credentialStore = credentialStore;
        this.client = client;
        this.ttl = Duration.ofSeconds(properties.getEntitlementCacheSeconds());
    }

    /**
     * Current entitlement, refreshing if stale. {@link Optional#empty()} means "unknown" — either
     * not linked or the SaaS side is unreachable and we have no prior snapshot.
     */
    public Optional<InstanceEntitlement> current() {
        // Single-flight: when stale, exactly one thread refreshes (blocking on the SaaS
        // call) while concurrent callers serve the last snapshot — no thundering herd of
        // synchronous round-trips on the billable hot path. Safe because the gate fails open.
        if (isStale(snapshot) && refreshing.compareAndSet(false, true)) {
            try {
                refresh();
            } finally {
                refreshing.set(false);
            }
        }
        return Optional.ofNullable(snapshot.entitlement());
    }

    private boolean isStale(Snapshot snap) {
        return snap.entitlement() == null
                || Duration.between(snap.fetchedAt(), Instant.now()).compareTo(ttl) >= 0;
    }

    /** Pulls a fresh snapshot. Keeps the previous one on failure (fail-open). */
    void refresh() {
        Optional<DeviceCredential> cred = credentialStore.get();
        if (cred.isEmpty()) {
            // Unlinked: clear any stale snapshot so the gate sees "not linked".
            snapshot = new Snapshot(null, Instant.now());
            return;
        }
        InstanceEntitlement fresh =
                client.fetchEntitlement(cred.get().getDeviceId(), cred.get().getDeviceSecret());
        if (fresh != null) {
            snapshot = new Snapshot(fresh, Instant.now());
        } else {
            // Unreachable: keep the last known snapshot (may be null) and let the gate fail open.
            log.debug("Entitlement refresh failed; reusing last known snapshot");
        }
    }

    /** Forces a refresh on the next {@link #current()} (e.g. right after linking). */
    public void invalidate() {
        snapshot = new Snapshot(snapshot.entitlement(), Instant.EPOCH);
    }
}
