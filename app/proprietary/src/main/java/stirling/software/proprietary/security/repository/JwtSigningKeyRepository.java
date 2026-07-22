package stirling.software.proprietary.security.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.security.model.JwtSigningKeyEntity;

/** Shared-DB store of JWT signing keys - the source of truth every cluster node reads from. */
@Repository
public interface JwtSigningKeyRepository extends JpaRepository<JwtSigningKeyEntity, String> {

    /** Newest first, so the most recently created key is the active signing key. */
    List<JwtSigningKeyEntity> findAllByOrderByCreatedAtDesc();

    /**
     * The current active signing key: the single newest row. Used for cheap cluster convergence.
     */
    Optional<JwtSigningKeyEntity> findFirstByOrderByCreatedAtDesc();

    /** Keys created before the cutoff, eligible for rotation cleanup. */
    List<JwtSigningKeyEntity> findByCreatedAtBefore(LocalDateTime cutoff);
}
