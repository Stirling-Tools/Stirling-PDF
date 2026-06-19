package stirling.software.saas.payg.repository;

import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.LockModeType;

import stirling.software.saas.payg.policy.PaygTeamExtensions;

@ApplicationScoped
public class PaygTeamExtensionsRepository
        implements PanacheRepositoryBase<PaygTeamExtensions, Long> {

    /** Spring-style saveOrUpdate kept for callers; persists new rows, merges existing ones. */
    public PaygTeamExtensions save(PaygTeamExtensions entity) {
        if (entity.getTeamId() == null || getEntityManager().contains(entity)) {
            persist(entity);
            return entity;
        }
        return getEntityManager().merge(entity);
    }

    public Optional<PaygTeamExtensions> findByStripeCustomerId(String stripeCustomerId) {
        return find("stripeCustomerId = ?1", stripeCustomerId).firstResultOptional();
    }

    /**
     * Pessimistic-write load of the sidecar row, used by the charge pipeline to deduct the one-time
     * free grant atomically. The lock serialises concurrent charges for the same team so the
     * per-job free_units_consumed split is exact. Different teams never contend.
     */
    public Optional<PaygTeamExtensions> findByIdForUpdate(Long teamId) {
        return Optional.ofNullable(
                getEntityManager()
                        .find(PaygTeamExtensions.class, teamId, LockModeType.PESSIMISTIC_WRITE));
    }

    /**
     * Atomically returns freeUnitsConsumed to the team's grant on a refund. Increment is
     * commutative so no lock is needed; the amount restored is exactly what the job consumed.
     */
    public int restoreFreeUnits(Long teamId, long units) {
        return getEntityManager()
                .createQuery(
                        "UPDATE PaygTeamExtensions e"
                                + " SET e.freeUnitsRemaining = e.freeUnitsRemaining + :units"
                                + " WHERE e.teamId = :teamId")
                .setParameter("units", units)
                .setParameter("teamId", teamId)
                .executeUpdate();
    }
}
