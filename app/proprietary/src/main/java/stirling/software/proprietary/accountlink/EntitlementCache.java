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
 * Caches the linked team's entitlement so the request-time gate needn't call SaaS on every billable
 * request. Single-slot (one instance = one linked team), TTL-based.
 *
 * <p>A transport failure fails open — {@link #current()} keeps serving the freshest snapshot it has
 * and returns {@link Optional#empty()} ("unknown → allow") only when nothing was ever fetched. An
 * authoritative deny ({@link AccountLinkClient.RevokedException}) does not: the snapshot is
 * replaced with a {@link EntitlementState#REVOKED} entitlement so the gate blocks immediately.
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

    /** Blocked entitlement synthesised on an authoritative deny (revoked/invalid credential). */
    private static final InstanceEntitlement REVOKED =
            new InstanceEntitlement(false, 0, 0, null, EntitlementState.REVOKED);

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
        // Single-flight: when stale, exactly one thread refreshes while concurrent callers serve
        // the last snapshot — no thundering herd of round-trips on the billable hot path.
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
        // fetchedAt is the last *attempt* time (stamped on success and failure), so a failed fetch
        // backs off a full TTL instead of every request re-triggering a round-trip to a dead SaaS.
        return Duration.between(snap.fetchedAt(), Instant.now()).compareTo(ttl) >= 0;
    }

    /**
     * Pulls a fresh snapshot. On a transport failure keeps the previous entitlement but stamps the
     * attempt time so re-fetches throttle to the TTL; on an authoritative deny replaces it with a
     * blocked snapshot.
     */
    void refresh() {
        Optional<DeviceCredential> cred = credentialStore.get();
        if (cred.isEmpty()) {
            // Unlinked: clear any stale snapshot so the gate sees "not linked".
            snapshot = new Snapshot(null, Instant.now());
            return;
        }
        try {
            InstanceEntitlement fresh =
                    client.fetchEntitlement(cred.get().getDeviceId(), cred.get().getDeviceSecret());
            if (fresh != null) {
                snapshot = new Snapshot(fresh, Instant.now());
            } else {
                // Unreachable / server error: keep the last known entitlement but stamp the attempt
                // so we don't hammer SaaS; the gate fails open meanwhile.
                log.debug(
                        "Entitlement refresh failed; reusing last known snapshot, backing off a TTL");
                snapshot = new Snapshot(snapshot.entitlement(), Instant.now());
            }
        } catch (AccountLinkClient.RevokedException e) {
            // Authoritative deny — block immediately rather than serving the stale entitled
            // snapshot.
            log.info(
                    "Entitlement denied (HTTP {}); blocking billable work for the revoked credential",
                    e.status());
            snapshot = new Snapshot(REVOKED, Instant.now());
        }
    }

    /** Forces a refresh on the next {@link #current()} (e.g. right after linking). */
    public void invalidate() {
        snapshot = new Snapshot(snapshot.entitlement(), Instant.EPOCH);
    }

    /**
     * Seeds the cache with an entitlement obtained out-of-band (the sync reply carries a fresh
     * one), saving a redundant fetch. No-op on null.
     */
    public void accept(InstanceEntitlement fresh) {
        if (fresh != null) {
            snapshot = new Snapshot(fresh, Instant.now());
        }
    }
}
