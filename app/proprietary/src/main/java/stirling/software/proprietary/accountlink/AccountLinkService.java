package stirling.software.proprietary.accountlink;

import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/** Linking orchestrator (self-hosted side of combined billing). */
@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(
        name = "stirling.billing.account-link.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class AccountLinkService {

    private final AccountLinkClient client;
    private final DeviceCredentialStore credentialStore;
    private final EntitlementCache entitlementCache;

    public AccountLinkService(
            AccountLinkClient client,
            DeviceCredentialStore credentialStore,
            EntitlementCache entitlementCache) {
        this.client = client;
        this.credentialStore = credentialStore;
        this.entitlementCache = entitlementCache;
    }

    /** Status of this instance's link, for the portal's "Account link" card. */
    public record LinkStatus(
            boolean linked,
            String deviceId,
            Long teamId,
            String linkedAt,
            EntitlementCache.ConnectionStatus connection) {
        public LinkStatus(boolean linked, String deviceId, Long teamId, String linkedAt) {
            this(linked, deviceId, teamId, linkedAt, null);
        }
    }

    /**
     * Unlinks this instance — best-effort tells SaaS to revoke first (so the row gets {@code
     * revoked_at} set), then clears locally regardless.
     */
    public void unlink() {
        credentialStore
                .get()
                .ifPresent(
                        c -> {
                            boolean ok = client.revokeSelf(c.getDeviceId(), c.getDeviceSecret());
                            if (!ok) {
                                log.warn(
                                        "Account-link: SaaS self-revoke failed for device {};"
                                                + " clearing locally anyway (admin can revoke"
                                                + " from the portal).",
                                        c.getDeviceId());
                            }
                        });
        credentialStore.clear();
        entitlementCache.invalidate();
        log.info("Account-link: instance unlinked");
    }

    /** Forces a cloud check for an administrator retrying a restored connection. */
    public LinkStatus recheck() {
        entitlementCache.invalidate();
        return status();
    }

    /** Local only: unlike {@link #status()}, never refreshes entitlement from Stirling Cloud. */
    public boolean isLinked() {
        return credentialStore.isLinked();
    }

    public LinkStatus status() {
        Optional<DeviceCredential> cred = credentialStore.get();
        if (cred.isPresent()) entitlementCache.current();
        return cred.map(
                        c ->
                                new LinkStatus(
                                        true,
                                        c.getDeviceId(),
                                        c.getTeamId(),
                                        c.getLinkedAt() != null ? c.getLinkedAt().toString() : null,
                                        entitlementCache.connectionStatus()))
                .orElseGet(() -> new LinkStatus(false, null, null, null));
    }
}
