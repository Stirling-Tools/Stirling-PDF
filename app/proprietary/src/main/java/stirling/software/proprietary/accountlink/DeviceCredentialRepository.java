package stirling.software.proprietary.accountlink;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface DeviceCredentialRepository extends JpaRepository<DeviceCredential, Long> {

    /** The singleton credential, if this instance has linked. */
    default Optional<DeviceCredential> findCredential() {
        return findById(DeviceCredential.SINGLETON_ID);
    }
}
