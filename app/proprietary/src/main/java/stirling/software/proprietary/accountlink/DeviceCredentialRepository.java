package stirling.software.proprietary.accountlink;

import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

@ApplicationScoped
public class DeviceCredentialRepository implements PanacheRepositoryBase<DeviceCredential, Long> {

    /** The singleton credential, if this instance has linked. */
    public Optional<DeviceCredential> findCredential() {
        return findByIdOptional(DeviceCredential.SINGLETON_ID);
    }

    /**
     * Spring Data's {@code save}. The id is assigned rather than generated, so a detached
     * credential must merge (insert-or-update); re-linking replaces the existing row.
     */
    @Transactional
    public DeviceCredential save(DeviceCredential credential) {
        if (credential.getId() == null || getEntityManager().contains(credential)) {
            persist(credential);
            return credential;
        }
        return getEntityManager().merge(credential);
    }
}
