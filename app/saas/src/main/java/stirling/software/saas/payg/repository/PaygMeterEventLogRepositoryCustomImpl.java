package stirling.software.saas.payg.repository;

import java.util.UUID;

import org.hibernate.query.NativeQuery;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

/** See {@link PaygMeterEventLogRepositoryCustom}. */
class PaygMeterEventLogRepositoryCustomImpl implements PaygMeterEventLogRepositoryCustom {

    @PersistenceContext private EntityManager entityManager;

    /**
     * Idempotent pending insert. The two meter triggers (charge-completion + stale-close) share the
     * idempotency key, and a reconcile retry re-runs the same path, so {@code ON CONFLICT DO
     * NOTHING} keeps the audit row at exactly one per key. {@code occurred_at} defaults to {@code
     * CURRENT_TIMESTAMP} at the DB; {@code posted_to_stripe_at} stays NULL until success.
     * Transactional because it's called from the non-transactional meter-reporting path.
     */
    @Override
    @Transactional
    public void insertPending(Long teamId, UUID jobId, String key, int units) {
        entityManager
                .createNativeQuery(
                        "INSERT INTO payg_meter_event_log (team_id, job_id, idempotency_key,"
                                + " units) VALUES (:teamId, :jobId, :key, :units) ON CONFLICT"
                                + " (idempotency_key) DO NOTHING")
                .setParameter("teamId", teamId)
                .setParameter("jobId", jobId)
                .setParameter("key", key)
                .setParameter("units", units)
                .unwrap(NativeQuery.class)
                // The insert writes only payg_meter_event_log; see
                // PaygMeterEventLogRepositoryCustom.
                .addSynchronizedQuerySpace("payg_meter_event_log")
                .executeUpdate();
    }
}
