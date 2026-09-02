package stirling.software.proprietary.accountlink;

import java.util.Optional;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.extern.slf4j.Slf4j;

/**
 * Linking orchestrator (self-hosted side of combined-billing "Mode A").
 *
 * <p>{@link #link} is the same-origin action the portal triggers: it relays the admin's Supabase
 * JWT to the SaaS register endpoint, then persists the returned device credential secure-at-rest.
 * The credential — not the JWT — authenticates all later unattended entitlement calls.
 */
// Arc cannot gate a bean on a runtime property, so the account-link flag no longer removes this
// bean; only the flag-gated link endpoints reach it, so nothing links while the flag is off.
@Slf4j
@ApplicationScoped
@IfBuildProfile("!saas")
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
