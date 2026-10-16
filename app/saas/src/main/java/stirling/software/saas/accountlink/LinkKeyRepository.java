package stirling.software.saas.accountlink;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

/** Data access for {@link LinkKey}. */
public interface LinkKeyRepository extends JpaRepository<LinkKey, Long> {

    /** Row-locking read used by redeem and revoke, so a key cannot be both. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT k FROM LinkKey k WHERE k.keyId = :keyId")
    Optional<LinkKey> findByKeyIdForUpdate(@Param("keyId") String keyId);

    @Query(
            "SELECT k FROM LinkKey k WHERE k.teamId = :teamId AND k.redeemedAt IS NULL"
                    + " AND k.revokedAt IS NULL AND k.expiresAt > :now ORDER BY k.createdAt DESC")
    List<LinkKey> findUsableByTeam(@Param("teamId") Long teamId, @Param("now") LocalDateTime now);

    @Query(
            "SELECT k.instanceId FROM LinkKey k WHERE k.teamId = :teamId"
                    + " AND k.instanceId IS NOT NULL")
    List<Long> findRedeemedInstanceIds(@Param("teamId") Long teamId);

    /** Redeemed keys are kept: they record how an instance was linked. */
    @Modifying
    @Query("DELETE FROM LinkKey k WHERE k.redeemedAt IS NULL AND k.expiresAt < :cutoff")
    int deleteUnredeemedExpiredBefore(@Param("cutoff") LocalDateTime cutoff);
}
