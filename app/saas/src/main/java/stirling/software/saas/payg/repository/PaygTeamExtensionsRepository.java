package stirling.software.saas.payg.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;

import stirling.software.saas.payg.policy.PaygTeamExtensions;

@Repository
public interface PaygTeamExtensionsRepository extends JpaRepository<PaygTeamExtensions, Long> {

    Optional<PaygTeamExtensions> findByStripeCustomerId(String stripeCustomerId);

    /**
     * Pessimistic-write load of the sidecar row, used by the charge pipeline to move the free grant
     * atomically. The lock serialises concurrent charges <em>for the same team</em> so the per-job
     * {@code free_units_consumed} split is exact — two simultaneous jobs can't both believe they
     * drew from the same remaining unit. Different teams never contend.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM PaygTeamExtensions e WHERE e.teamId = :teamId")
    Optional<PaygTeamExtensions> findByIdForUpdate(@Param("teamId") Long teamId);
}
