package stirling.software.saas.accountlink;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;

@Repository
public interface PairingRequestRepository extends JpaRepository<PairingRequest, Long> {

    Optional<PairingRequest> findByUserCode(String userCode);

    /**
     * Row-locked read for the poll path. Two pods of one deployment can present the same device
     * code concurrently; without the lock both could pass the {@code APPROVED} check and mint two
     * credentials for one pairing.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PairingRequest p where p.deviceCodeHash = :hash")
    Optional<PairingRequest> findByDeviceCodeHashForUpdate(@Param("hash") String hash);

    /** Rate-limit input: how many pairings this address has started recently. */
    long countByRequesterIpAndCreatedAtAfter(String requesterIp, LocalDateTime after);
}
