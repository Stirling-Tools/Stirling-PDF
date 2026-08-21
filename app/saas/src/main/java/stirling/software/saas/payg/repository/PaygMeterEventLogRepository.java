package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.saas.payg.meter.PaygMeterEventLog;

@Repository
public interface PaygMeterEventLogRepository extends JpaRepository<PaygMeterEventLog, Long> {

    /**
     * Idempotent pending insert. The two meter triggers (charge-completion + stale-close) share the
     * idempotency key, and a reconcile retry re-runs the same path, so {@code ON CONFLICT DO
     * NOTHING} keeps the audit row at exactly one per key. {@code occurred_at} defaults to {@code
     * CURRENT_TIMESTAMP} at the DB; {@code posted_to_stripe_at} stays NULL until success.
     * Transactional because it's called from the non-transactional meter-reporting path.
     */
    @Transactional
    @Modifying
    @Query(
            value =
                    "INSERT INTO payg_meter_event_log (team_id, job_id, idempotency_key, units)"
                            + " VALUES (:teamId, :jobId, :key, :units)"
                            + " ON CONFLICT (idempotency_key) DO NOTHING",
            nativeQuery = true)
    void insertPending(
            @Param("teamId") Long teamId,
            @Param("jobId") UUID jobId,
            @Param("key") String key,
            @Param("units") int units);

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
