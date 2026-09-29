package stirling.software.proprietary.accountlink;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/** Caches cloud entitlement; callers must also enforce the persisted offline deadline. */
@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(
        name = "stirling.billing.account-link.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class EntitlementCache {

    private final DeviceCredentialStore credentialStore;
    private final AccountLinkClient client;
    private final Duration ttl;
    private final Duration grace;
    private final Clock clock;

    /** Entitlement + fetch time, swapped atomically as one value so readers never tear. */
    private record Snapshot(
            InstanceEntitlement entitlement,
            Instant fetchedAt,
            Instant lastSuccess,
            boolean offline) {}

    private static final Snapshot EMPTY = new Snapshot(null, Instant.EPOCH, null, false);

    /** Blocked entitlement synthesised on an authoritative deny (revoked/invalid credential). */
    private static final InstanceEntitlement REVOKED =
            new InstanceEntitlement(false, 0, 0, null, EntitlementState.REVOKED);

    private volatile Snapshot snapshot = EMPTY;
    private volatile String snapshotDeviceId;

    /** Single-flight guard: one thread refreshes while others serve the current snapshot. */
    private final AtomicBoolean refreshing = new AtomicBoolean(false);

    @Autowired
    public EntitlementCache(
            DeviceCredentialStore credentialStore,
            AccountLinkClient client,
            AccountLinkProperties properties) {
        this(credentialStore, client, properties, Clock.systemDefaultZone());
    }

    EntitlementCache(
            DeviceCredentialStore credentialStore,
            AccountLinkClient client,
            AccountLinkProperties properties,
            Clock clock) {
        this.credentialStore = credentialStore;
        this.client = client;
        this.ttl = Duration.ofSeconds(properties.getEntitlementCacheSeconds());
        this.grace =
                Duration.ofDays(
                        properties.getMetering().getGraceDays() > 0
                                ? properties.getMetering().getGraceDays()
                                : 3);
        this.clock = clock;
    }

    /**
     * Current entitlement, refreshing if stale. {@link Optional#empty()} means "unknown" — either
     * not linked or the SaaS side is unreachable and we have no prior snapshot.
     */
    public Optional<InstanceEntitlement> current() {
        String linked = linkedDeviceId();
        if (!Objects.equals(linked, snapshotDeviceId)) {
            snapshot = EMPTY;
            snapshotDeviceId = linked;
        }
        // Single-flight: when stale, exactly one thread refreshes while concurrent callers serve
        // the last snapshot — no thundering herd of round-trips on the billable hot path.
        if (isStale(snapshot) && refreshing.compareAndSet(false, true)) {
            try {
                refresh();
            } finally {
                refreshing.set(false);
            }
        }
        if (snapshot.entitlement() == null
                && credentialStore
                        .get()
                        .map(DeviceCredential::isEntitlementRevoked)
                        .orElse(false)) {
            return Optional.of(REVOKED);
        }
        return Optional.ofNullable(snapshot.entitlement());
    }

    /** Identity owning the cached allowance; absent after an explicit unlink. */
    public String linkedDeviceId() {
        return credentialStore.get().map(DeviceCredential::getDeviceId).orElse(null);
    }

    private boolean isStale(Snapshot snap) {
        // fetchedAt is the last *attempt* time (stamped on success and failure), so a failed fetch
        // backs off a full TTL instead of every request re-triggering a round-trip to a dead SaaS.
        return Duration.between(snap.fetchedAt(), clock.instant()).compareTo(ttl) >= 0;
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
            snapshot = new Snapshot(null, clock.instant(), null, false);
            return;
        }
        try {
            InstanceEntitlement fresh =
                    client.fetchEntitlement(cred.get().getDeviceId(), cred.get().getDeviceSecret());
            if (!Objects.equals(cred.get().getDeviceId(), linkedDeviceId())) return;
            if (fresh != null) {
                snapshot = successfulSnapshot(cred.get().getDeviceId(), fresh);
            } else {
                // Unreachable / server error: keep the last known entitlement but stamp the attempt
                // so requests back off; the persisted offline deadline still applies.
                log.debug(
                        "Entitlement refresh failed; reusing last known snapshot, backing off a TTL");
                snapshot =
                        new Snapshot(
                                snapshot.entitlement(),
                                clock.instant(),
                                snapshot.lastSuccess(),
                                true);
            }
        } catch (AccountLinkClient.RevokedException e) {
            if (!Objects.equals(cred.get().getDeviceId(), linkedDeviceId())) return;
            // Authoritative deny — block immediately rather than serving the stale entitled
            // snapshot.
            log.info(
                    "Entitlement denied (HTTP {}); blocking billable work for the revoked credential",
                    e.status());
            snapshot = successfulSnapshot(cred.get().getDeviceId(), REVOKED);
        }
    }

    private Snapshot successfulSnapshot(String deviceId, InstanceEntitlement entitlement) {
        Instant now = clock.instant();
        credentialStore.recordEntitlementContact(
                deviceId,
                now,
                entitlement.state() == EntitlementState.REVOKED,
                entitlement.fleetUserLimit());
        return new Snapshot(entitlement, now, now, false);
    }

    /** The current device's persisted allowance is usable only within its offline grace. */
    public Integer fleetUserLimit() {
        if (isGraceExpired()) return null;
        var credential = credentialStore.get();
        if (credential.isEmpty() || credential.get().isEntitlementRevoked()) return null;
        if (Objects.equals(snapshotDeviceId, credential.get().getDeviceId())
                && snapshot.entitlement() != null) {
            return snapshot.entitlement().state() == EntitlementState.REVOKED
                    ? null
                    : snapshot.entitlement().fleetUserLimit();
        }
        return credential.get().getFleetUserLimit();
    }

    /** Applies across restarts and independently of metering or the presence of cached data. */
    public boolean isGraceExpired() {
        ConnectionStatus status = connectionStatus();
        return "expired".equals(status.state());
    }

    /** The caller refreshes with current() first; this method performs no network request. */
    public ConnectionStatus connectionStatus() {
        Optional<DeviceCredential> credential = credentialStore.get();
        if (credential.isEmpty()) return new ConnectionStatus("unlinked", null, null);
        DeviceCredential device = credential.get();
        Instant last = device.getLastEntitlementSuccessAt();
        Snapshot current =
                Objects.equals(device.getDeviceId(), snapshotDeviceId) ? snapshot : EMPTY;
        if (current.lastSuccess() != null
                && (last == null || current.lastSuccess().isAfter(last))) {
            last = current.lastSuccess();
        }
        Instant reference =
                last != null
                        ? last
                        : device.getLinkedAt() == null
                                ? Instant.EPOCH
                                : device.getLinkedAt().atZone(clock.getZone()).toInstant();
        Instant deadline = reference.plus(grace);
        boolean currentIsNewer =
                current.lastSuccess() != null
                        && (device.getLastEntitlementSuccessAt() == null
                                || !current.lastSuccess()
                                        .isBefore(device.getLastEntitlementSuccessAt()));
        boolean revoked =
                currentIsNewer
                        ? current.entitlement() != null
                                && current.entitlement().state() == EntitlementState.REVOKED
                        : device.isEntitlementRevoked();
        String state =
                revoked
                        ? "revoked"
                        : !clock.instant().isBefore(deadline)
                                ? "expired"
                                : current.offline() ? "offline" : "connected";
        return new ConnectionStatus(state, last, deadline);
    }

    public record ConnectionStatus(
            String state, Instant lastSuccessAt, Instant offlineAccessUntil) {}

    /** Forces a refresh on the next {@link #current()} (e.g. right after linking). */
    public void invalidate() {
        snapshot =
                new Snapshot(
                        snapshot.entitlement(),
                        Instant.EPOCH,
                        snapshot.lastSuccess(),
                        snapshot.offline());
    }

    /**
     * Seeds the cache with an entitlement obtained out-of-band (the sync reply carries a fresh
     * one), saving a redundant fetch. Ignores null and replies for a different linked device.
     */
    public void accept(String deviceId, InstanceEntitlement fresh) {
        if (fresh != null && deviceId != null && Objects.equals(deviceId, linkedDeviceId())) {
            snapshotDeviceId = deviceId;
            snapshot = successfulSnapshot(deviceId, fresh);
        }
    }
}
