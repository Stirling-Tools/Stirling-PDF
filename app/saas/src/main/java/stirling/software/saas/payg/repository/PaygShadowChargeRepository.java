package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.saas.payg.model.ShadowChargeStatus;
import stirling.software.saas.payg.shadow.PaygShadowCharge;

@ApplicationScoped
public class PaygShadowChargeRepository implements PanacheRepositoryBase<PaygShadowCharge, Long> {

    /** Spring-style saveOrUpdate kept for callers; persists new rows, merges detached ones. */
    public PaygShadowCharge save(PaygShadowCharge entity) {
        if (entity.getId() == null) {
            persist(entity);
            return entity;
        }
        return getEntityManager().merge(entity);
    }

    public List<PaygShadowCharge> findInWindow(LocalDateTime from, LocalDateTime to) {
        return find("occurredAt >= ?1 AND occurredAt < ?2 ORDER BY occurredAt DESC", from, to)
                .list();
    }

    /**
     * The shadow row written when the given process was opened. At most one row per jobId exists.
     */
    public Optional<PaygShadowCharge> findFirstByJobIdOrderByIdAsc(UUID jobId) {
        return find("jobId = ?1 ORDER BY id ASC", jobId).firstResultOptional();
    }

    /**
     * Paid (Stripe-metered) documents for a team in a period: SUM(paygUnits - freeUnitsConsumed)
     * over CHARGED rows; the metered total reported to Stripe. REFUNDED rows are excluded.
     */
    public long sumPaidUnits(Long teamId, LocalDateTime from, LocalDateTime to) {
        Object result =
                getEntityManager()
                        .createQuery(
                                "SELECT COALESCE(SUM(s.paygUnits - s.freeUnitsConsumed), 0)"
                                        + " FROM PaygShadowCharge s"
                                        + " WHERE s.teamId = :teamId"
                                        + " AND s.status = :status"
                                        + " AND s.occurredAt >= :from AND s.occurredAt < :to")
                        .setParameter("teamId", teamId)
                        .setParameter("status", ShadowChargeStatus.CHARGED)
                        .setParameter("from", from)
                        .setParameter("to", to)
                        .getSingleResult();
        return ((Number) result).longValue();
    }
}
