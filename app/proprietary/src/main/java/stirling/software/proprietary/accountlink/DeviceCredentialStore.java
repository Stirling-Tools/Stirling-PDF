package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;
import java.util.Optional;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

/**
 * Secure-at-rest persistence for this instance's device credential. Thin wrapper over the
 * singleton-row repository so the rest of the feature never touches JPA directly.
 *
 * <p>{@code @IfBuildProfile("!saas")}: only the self-hosted profile links outward to a SaaS team.
 */
// Arc cannot gate a bean on a runtime property, so the account-link flag no longer removes this
// bean; every caller is flag-gated, and an unlinked instance simply has no credential row.
@ApplicationScoped
@IfBuildProfile("!saas")
public class DeviceCredentialStore {

    private final DeviceCredentialRepository repo;

    public DeviceCredentialStore(DeviceCredentialRepository repo) {
        this.repo = repo;
    }

    @Transactional
    public Optional<DeviceCredential> get() {
        return repo.findCredential();
    }

    @Transactional
    public boolean isLinked() {
        return repo.findCredential().isPresent();
    }

    /** Persists (or replaces) the credential returned by a SaaS register call. */
    @Transactional
    public void save(String deviceId, String deviceSecret, Long teamId) {
        DeviceCredential cred = repo.findCredential().orElseGet(DeviceCredential::new);
        cred.setId(DeviceCredential.SINGLETON_ID);
        cred.setDeviceId(deviceId);
        cred.setDeviceSecret(deviceSecret);
        cred.setTeamId(teamId);
        cred.setLinkedAt(LocalDateTime.now());
        repo.save(cred);
    }

    /** Unlinks this instance locally (idempotent). */
    @Transactional
    public void clear() {
        repo.findCredential().ifPresent(repo::delete);
    }
}
