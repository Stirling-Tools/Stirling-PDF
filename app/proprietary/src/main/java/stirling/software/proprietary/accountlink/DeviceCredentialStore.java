package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Secure-at-rest persistence for this instance's device credential. Thin wrapper over the
 * singleton-row repository so the rest of the feature never touches JPA directly.
 *
 * <p>Gated + {@code @Profile("!saas")}: only the self-hosted profile links outward to a SaaS team.
 */
@Service
@Profile("!saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class DeviceCredentialStore {

    private final DeviceCredentialRepository repo;

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
