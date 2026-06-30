package stirling.software.saas.accountlink;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

/**
 * Data access for {@link LinkedInstance}. Plain Spring Data JPA against {@code stirling_pdf} —
 * native schema access, no RPC, consistent with the rest of the SaaS backend.
 */
public interface LinkedInstanceRepository extends JpaRepository<LinkedInstance, Long> {

    /**
     * Active-credential lookup for the device-credential auth filter (revoked rows never match).
     */
    Optional<LinkedInstance> findByDeviceIdAndRevokedAtIsNull(String deviceId);

    /** Backs the portal "Linked instances" list (includes revoked, newest first). */
    List<LinkedInstance> findByTeamIdOrderByCreatedAtDesc(Long teamId);

    /** Active (non-revoked) linked instances on a team — the orphan guard's count. */
    long countByTeamIdAndRevokedAtIsNull(Long teamId);

    /**
     * Stamps liveness on a single instance. A targeted single-column UPDATE rather than a
     * full-entity {@code save}: the auth filter loads the instance outside a transaction, so a full
     * save would write back the stale (in-memory {@code null}) {@code revoked_at} and could
     * silently un-revoke a credential that was revoked between the read and the write. The {@code
     * revoked_at IS NULL} guard makes this a no-op once revoked.
     */
    @Modifying
    @Transactional
    @Query(
            "UPDATE LinkedInstance li SET li.lastSeenAt = :now "
                    + "WHERE li.instanceId = :instanceId AND li.revokedAt IS NULL")
    int touchLastSeen(@Param("instanceId") Long instanceId, @Param("now") LocalDateTime now);
}
