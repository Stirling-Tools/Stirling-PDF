package stirling.software.saas.payg.bundle;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;

@Repository
public interface PrepaidBundleRepository extends JpaRepository<PrepaidBundle, Long> {

    /**
     * A team's still-drawable pools (units left, not expired), soonest-expiring first, locked for
     * the draw transaction. Mirrors {@code PaygTeamExtensionsRepository.findByIdForUpdate}: the
     * PESSIMISTIC_WRITE lock serialises concurrent charges for the same team so two jobs can't both
     * draw the same remaining unit, keeping the per-job {@code bundle_units_consumed} split exact.
     * Drawn FIFO — the caller depletes the earliest-expiring pool first so capacity is used before
     * it lapses. Filters on {@code expires_at} so an expired pool is never drawn even if the expiry
     * sweep hasn't run (lazy expiry).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
            "SELECT b FROM PrepaidBundle b WHERE b.teamId = :teamId AND b.unitsRemaining > 0"
                    + " AND b.expiresAt > :now ORDER BY b.expiresAt ASC")
    List<PrepaidBundle> findDrawableForUpdate(
            @Param("teamId") Long teamId, @Param("now") LocalDateTime now);

    /**
     * A team's in-term pools (not yet expired), soonest-expiring first — read-only, for the wallet
     * snapshot. Includes exhausted-but-in-term pools so the "X of Y used" meter keeps the right
     * denominator for the current term. Small per team; the service aggregates in Java.
     */
    @Query(
            "SELECT b FROM PrepaidBundle b WHERE b.teamId = :teamId AND b.expiresAt > :now"
                    + " ORDER BY b.expiresAt ASC")
    List<PrepaidBundle> findInTerm(@Param("teamId") Long teamId, @Param("now") LocalDateTime now);

    /**
     * A team's in-term pools (not yet expired), soonest-expiring first, locked — for the refund
     * restore path. Unlike {@link #findDrawableForUpdate} this includes pools already drawn to zero
     * (that's exactly where a just-drawn charge's units go back), capped at {@code units_total} by
     * the caller.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
            "SELECT b FROM PrepaidBundle b WHERE b.teamId = :teamId AND b.expiresAt > :now"
                    + " ORDER BY b.expiresAt ASC")
    List<PrepaidBundle> findInTermForUpdate(
            @Param("teamId") Long teamId, @Param("now") LocalDateTime now);
}
