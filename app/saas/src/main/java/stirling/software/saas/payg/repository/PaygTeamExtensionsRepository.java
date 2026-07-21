package stirling.software.saas.payg.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;

import stirling.software.saas.payg.policy.PaygTeamExtensions;

@Repository
public interface PaygTeamExtensionsRepository extends JpaRepository<PaygTeamExtensions, Long> {

    Optional<PaygTeamExtensions> findByStripeCustomerId(String stripeCustomerId);

    /**
     * Pessimistic-write load of the sidecar row, used by the charge pipeline to deduct the one-time
     * free grant atomically. The lock serialises concurrent charges <em>for the same team</em> so
     * the per-job {@code free_units_consumed} split (and therefore the metered paid portion) is
     * exact — two simultaneous jobs can't both believe they drew from the same remaining unit.
     * Different teams never contend; the lock is held only for the {@code openProcess} transaction.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM PaygTeamExtensions e WHERE e.teamId = :teamId")
    Optional<PaygTeamExtensions> findByIdForUpdate(@Param("teamId") Long teamId);

    /**
     * Atomically returns {@code freeUnitsConsumed} to the team's grant on a refund. Increment is
     * commutative so no lock is needed; the amount restored is exactly what the job consumed, so it
     * can never exceed the original grant.
     */
    @Modifying
    @Query(
            "UPDATE PaygTeamExtensions e SET e.freeUnitsRemaining = e.freeUnitsRemaining + :units"
                    + " WHERE e.teamId = :teamId")
    int restoreFreeUnits(@Param("teamId") Long teamId, @Param("units") long units);
}
