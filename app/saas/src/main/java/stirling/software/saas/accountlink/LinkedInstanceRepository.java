package stirling.software.saas.accountlink;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

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
}
