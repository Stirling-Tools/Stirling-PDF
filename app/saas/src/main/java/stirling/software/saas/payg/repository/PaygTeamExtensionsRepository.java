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
     * Serialises concurrent charges for one team so the per-job {@code free_units_consumed} split
     * is exact: without the lock two simultaneous jobs both draw the same remaining free unit.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM PaygTeamExtensions e WHERE e.teamId = :teamId")
    Optional<PaygTeamExtensions> findByIdForUpdate(@Param("teamId") Long teamId);
}
