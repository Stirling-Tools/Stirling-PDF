package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.saas.payg.shadow.PaygShadowCharge;

@Repository
public interface PaygShadowChargeRepository extends JpaRepository<PaygShadowCharge, Long> {

    @Query(
            "SELECT s FROM PaygShadowCharge s"
                    + " WHERE s.occurredAt >= :from AND s.occurredAt < :to"
                    + " ORDER BY s.occurredAt DESC")
    List<PaygShadowCharge> findInWindow(
            @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /**
     * The shadow row written when the given process was opened. At most one row per {@code jobId}
     * exists by construction — {@code openProcess} writes exactly one row on OPENED and zero on
     * JOINED — so callers can treat the result as a single optional. Returns the first row by id
     * defensively if a duplicate ever appears.
     */
    Optional<PaygShadowCharge> findFirstByJobIdOrderByIdAsc(UUID jobId);

    /**
     * Paid (Stripe-metered) documents for a team in a period: {@code SUM(payg_units −
     * free_units_consumed)} over CHARGED rows. This is exactly what was reported to Stripe in the
     * window, so the wallet's "estimated bill so far" is the metered total × rate. REFUNDED rows
     * are excluded.
     */
    @Query(
            "SELECT COALESCE(SUM(s.paygUnits - s.freeUnitsConsumed), 0) FROM PaygShadowCharge s"
                    + " WHERE s.teamId = :teamId"
                    + " AND s.status = stirling.software.saas.payg.model.ShadowChargeStatus.CHARGED"
                    + " AND s.occurredAt >= :from AND s.occurredAt < :to")
    long sumPaidUnits(
            @Param("teamId") Long teamId,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);
}
