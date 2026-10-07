package stirling.software.proprietary.accountlink;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Secure-at-rest persistence for this instance's device credential. Thin wrapper over the
 * singleton-row repository so the rest of the feature never touches JPA directly.
 *
 * <p>Gated + {@code @Profile("!saas")}: only the self-hosted profile links outward to a SaaS team.
 */
@Service
@Profile("!saas")
@ConditionalOnProperty(
        name = "stirling.billing.account-link.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class DeviceCredentialStore {

    private final DeviceCredentialRepository repo;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private stirling.software.proprietary.security.repository.OrgOwnerRepository owners;

    public DeviceCredentialStore(DeviceCredentialRepository repo) {
        this.repo = repo;
    }

    @Transactional(readOnly = true)
    public Optional<DeviceCredential> get() {
        return repo.findCredential();
    }

    @Transactional(readOnly = true)
    public boolean isLinked() {
        return repo.findCredential().isPresent();
    }

    /** Persists (or replaces) the credential returned by a SaaS register call. */
    @Transactional
    public void save(String deviceId, String deviceSecret, Long teamId) {
        assertNoHandover();
        DeviceCredential cred = repo.findCredential().orElseGet(DeviceCredential::new);
        cred.setId(DeviceCredential.SINGLETON_ID);
        cred.setDeviceId(deviceId);
        cred.setDeviceSecret(deviceSecret);
        cred.setTeamId(teamId);
        cred.setLinkedAt(LocalDateTime.now());
        cred.setLastEntitlementSuccessAt(null);
        cred.setEntitlementRevoked(false);
        cred.setFleetUserLimit(null);
        repo.save(cred);
    }

    /** Commits successful contact independently of the caller's work or transaction rollback. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordEntitlementContact(
            String deviceId, Instant at, boolean revoked, Integer fleetUserLimit) {
        repo.recordEntitlementContact(deviceId, at, revoked, revoked ? null : fleetUserLimit);
    }

    /** Unlinks this instance locally (idempotent). */
    @Transactional
    public void clear() {
        assertNoHandover();
        repo.findCredential().ifPresent(repo::delete);
    }

    /**
     * Holds the ownership lock until the caller's transaction ends, including upstream revocation.
     */
    @Transactional
    public void assertNoHandover() {
        if (owners == null) return;
        owners.lockOwner()
                .ifPresent(
                        owner -> {
                            if (owner.getHandoverTargetId() != null) {
                                throw new org.springframework.web.server.ResponseStatusException(
                                        org.springframework.http.HttpStatus.CONFLICT,
                                        "Finish or cancel the ownership transfer before changing the account link.");
                            }
                        });
    }
}
