package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.saas.payg.meter.PaygMeterEventLog;

public interface PaygMeterEventLogRepository
        extends JpaRepository<PaygMeterEventLog, Long>, PaygMeterEventLogRepositoryCustom {

    /** Stamp an event posted; clears any prior error. No-op if already posted. */
    @Transactional
    @Modifying
    @Query(
            "UPDATE PaygMeterEventLog e"
                    + " SET e.postedToStripeAt = CURRENT_TIMESTAMP,"
                    + " e.stripeErrorCode = NULL, e.stripeErrorBody = NULL"
                    + " WHERE e.idempotencyKey = :key AND e.postedToStripeAt IS NULL")
    int markPosted(@Param("key") String key);

    /** Record the latest Stripe error against a still-pending event. */
    @Transactional
    @Modifying
    @Query(
            "UPDATE PaygMeterEventLog e"
                    + " SET e.stripeErrorCode = :code, e.stripeErrorBody = :body"
                    + " WHERE e.idempotencyKey = :key AND e.postedToStripeAt IS NULL")
    int markFailed(
            @Param("key") String key, @Param("code") String code, @Param("body") String body);

    /**
     * Events still unposted whose attempt is older than {@code cutoff} (give the live POST time to
     * land first) but within {@code floor} — Stripe's 24h idempotency window — so a retry under the
     * same key safely dedups rather than risking a double charge. Oldest first.
     */
    @Query(
            "SELECT e FROM PaygMeterEventLog e"
                    + " WHERE e.postedToStripeAt IS NULL"
                    + " AND e.occurredAt < :cutoff AND e.occurredAt >= :floor"
                    + " ORDER BY e.occurredAt ASC")
    List<PaygMeterEventLog> findRetryable(
            @Param("cutoff") LocalDateTime cutoff,
            @Param("floor") LocalDateTime floor,
            Pageable pageable);

    /** Events stuck unposted past the safe retry window — surfaced for manual reconciliation. */
    @Query(
            "SELECT COUNT(e) FROM PaygMeterEventLog e"
                    + " WHERE e.postedToStripeAt IS NULL AND e.occurredAt < :floor")
    long countStuck(@Param("floor") LocalDateTime floor);
}
