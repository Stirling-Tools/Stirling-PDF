package stirling.software.proprietary.accountlink;

import java.io.IOException;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Linking orchestrator (self-hosted side of combined-billing "Mode A").
 *
 * <p>{@link #link} is the same-origin action the portal triggers: it relays the admin's Supabase
 * JWT to the SaaS register endpoint, then persists the returned device credential secure-at-rest.
 * The credential — not the JWT — authenticates all later unattended entitlement calls.
 */
@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
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
    public record LinkStatus(boolean linked, String deviceId, Long teamId, String linkedAt) {}

    /**
     * Registers this instance with the SaaS team behind {@code supabaseJwt} and stores the
     * credential.
     *
     * @throws IOException if the SaaS register call fails (surfaced to the admin as a link error).
     */
    public LinkStatus link(String supabaseJwt, String instanceName) throws IOException {
        AccountLinkClient.RegisterResult result = client.register(supabaseJwt, instanceName);
        credentialStore.save(result.deviceId(), result.deviceSecret(), result.teamId());
        entitlementCache.invalidate();
        log.info("Account-link: instance linked to team {}", result.teamId());
        return status();
    }

    /**
     * Unlinks this instance — best-effort tells SaaS to revoke first (so the row gets {@code
     * revoked_at} set), then clears locally regardless. If SaaS is unreachable the local clear
     * still proceeds (admin's intent must win); the orphan row can be revoked from the portal.
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

    public LinkStatus status() {
        Optional<DeviceCredential> cred = credentialStore.get();
        return cred.map(
                        c ->
                                new LinkStatus(
                                        true,
                                        c.getDeviceId(),
                                        c.getTeamId(),
                                        c.getLinkedAt() != null
                                                ? c.getLinkedAt().toString()
                                                : null))
                .orElseGet(() -> new LinkStatus(false, null, null, null));
    }
}
