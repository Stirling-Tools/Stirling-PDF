package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.saas.payg.meter.PaygMeterEventLog;

@ApplicationScoped
public class PaygMeterEventLogRepository implements PanacheRepositoryBase<PaygMeterEventLog, Long> {

    /**
     * Idempotent pending insert. The two meter triggers (charge-completion + stale-close) share the
     * idempotency key, and a reconcile retry re-runs the same path, so {@code ON CONFLICT DO
     * NOTHING} keeps the audit row at exactly one per key. {@code occurred_at} defaults to {@code
     * CURRENT_TIMESTAMP} at the DB; {@code posted_to_stripe_at} stays NULL until success.
     */
    @Transactional
    public void insertPending(Long teamId, UUID jobId, String key, int units) {
        getEntityManager()
                .createNativeQuery(
                        "INSERT INTO payg_meter_event_log (team_id, job_id, idempotency_key, units)"
                                + " VALUES (:teamId, :jobId, :key, :units)"
                                + " ON CONFLICT (idempotency_key) DO NOTHING")
                .setParameter("teamId", teamId)
                .setParameter("jobId", jobId)
                .setParameter("key", key)
                .setParameter("units", units)
                .executeUpdate();
    }

    /** Stamp an event posted; clears any prior error. No-op if already posted. */
    @Transactional
    public int markPosted(String key) {
        return getEntityManager()
                .createQuery(
                        "UPDATE PaygMeterEventLog e"
                                + " SET e.postedToStripeAt = CURRENT_TIMESTAMP,"
                                + " e.stripeErrorCode = NULL, e.stripeErrorBody = NULL"
                                + " WHERE e.idempotencyKey = :key AND e.postedToStripeAt IS NULL")
                .setParameter("key", key)
                .executeUpdate();
    }

    /** Record the latest Stripe error against a still-pending event. */
    @Transactional
    public int markFailed(String key, String code, String body) {
        return getEntityManager()
                .createQuery(
                        "UPDATE PaygMeterEventLog e"
                                + " SET e.stripeErrorCode = :code, e.stripeErrorBody = :body"
                                + " WHERE e.idempotencyKey = :key AND e.postedToStripeAt IS NULL")
                .setParameter("code", code)
                .setParameter("body", body)
                .setParameter("key", key)
                .executeUpdate();
    }

    /**
     * Events still unposted whose attempt is older than {@code cutoff} (give the live POST time to
     * land first) but within {@code floor} — Stripe's 24h idempotency window — so a retry under the
     * same key safely dedups rather than risking a double charge. Oldest first, capped at {@code
     * limit}.
     */
    public List<PaygMeterEventLog> findRetryable(
            LocalDateTime cutoff, LocalDateTime floor, int limit) {
        return find(
                        "postedToStripeAt IS NULL AND occurredAt < ?1 AND occurredAt >= ?2"
                                + " ORDER BY occurredAt ASC",
                        cutoff,
                        floor)
                .page(0, limit)
                .list();
    }

    /** Events stuck unposted past the safe retry window — surfaced for manual reconciliation. */
    public long countStuck(LocalDateTime floor) {
        return count("postedToStripeAt IS NULL AND occurredAt < ?1", floor);
    }
}
