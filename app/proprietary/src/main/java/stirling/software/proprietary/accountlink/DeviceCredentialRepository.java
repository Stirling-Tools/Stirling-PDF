package stirling.software.proprietary.accountlink;

import java.time.Instant;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface DeviceCredentialRepository extends JpaRepository<DeviceCredential, Long> {

    /** Updates only the current device, so an old response cannot refresh a replacement link. */
    @Modifying(clearAutomatically = true)
    @Query(
            "update DeviceCredential c set c.lastEntitlementSuccessAt = :at, c.entitlementRevoked = :revoked, c.fleetUserLimit = :fleetUserLimit where c.deviceId = :deviceId and (c.lastEntitlementSuccessAt is null or c.lastEntitlementSuccessAt <= :at)")
    int recordEntitlementContact(
            String deviceId, Instant at, boolean revoked, Integer fleetUserLimit);

    /** The singleton credential, if this instance has linked. */
    default Optional<DeviceCredential> findCredential() {
        return findById(DeviceCredential.SINGLETON_ID);
    }
}
