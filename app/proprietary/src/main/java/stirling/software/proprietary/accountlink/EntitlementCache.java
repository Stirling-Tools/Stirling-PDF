package stirling.software.proprietary.accountlink;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

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

    private volatile InstanceEntitlement cached;
    private volatile Instant fetchedAt = Instant.EPOCH;

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
        if (isStale()) {
            refresh();
        }
        return Optional.ofNullable(cached);
    }

    private boolean isStale() {
        return cached == null || Duration.between(fetchedAt, Instant.now()).compareTo(ttl) >= 0;
    }

    /** Pulls a fresh snapshot. Keeps the previous one on failure (fail-open). */
    void refresh() {
        Optional<DeviceCredential> cred = credentialStore.get();
        if (cred.isEmpty()) {
            // Unlinked: clear any stale snapshot so the gate sees "not linked".
            cached = null;
            fetchedAt = Instant.now();
            return;
        }
        InstanceEntitlement fresh =
                client.fetchEntitlement(cred.get().getDeviceId(), cred.get().getDeviceSecret());
        if (fresh != null) {
            cached = fresh;
            fetchedAt = Instant.now();
        } else {
            // Unreachable: keep the last known snapshot (may be null) and let the gate fail open.
            log.debug("Entitlement refresh failed; reusing last known snapshot");
        }
    }

    /** Forces a refresh on the next {@link #current()} (e.g. right after linking). */
    public void invalidate() {
        fetchedAt = Instant.EPOCH;
    }
}
