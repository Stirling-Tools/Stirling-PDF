package stirling.software.saas.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import stirling.software.saas.model.SaasTeamExtensions;

public interface SaasTeamExtensionsRepository extends JpaRepository<SaasTeamExtensions, Long> {

    Optional<SaasTeamExtensions> findByTeamId(Long teamId);

    /**
     * Atomic seat claim for every team type. Returns 1 on success, 0 when capacity is exhausted.
     */
    @Query(value = "SELECT public.fleet_claim_cloud_seat(:teamId)", nativeQuery = true)
    int incrementSeatsUsed(@Param("teamId") Long teamId);

    @Query(
            value = "SELECT users_in_use FROM public.fleet_seat_snapshot(:teamId)",
            nativeQuery = true)
    Long fleetUsersInUse(@Param("teamId") Long teamId);

    @Query(
            value =
                    "SELECT users_in_use < capacity AND unreported_instances=0 FROM public.fleet_seat_snapshot(:teamId)",
            nativeQuery = true)
    Boolean fleetHasAvailableSeats(@Param("teamId") Long teamId);

    /** Atomic seat decrement. Floor at 0. Returns 1 on a real decrement, 0 if already at 0. */
    @Modifying
    @Query(
            "UPDATE SaasTeamExtensions e SET e.seatsUsed = e.seatsUsed - 1 "
                    + "WHERE e.teamId = :teamId AND e.seatsUsed > 0")
    int decrementSeatsUsed(@Param("teamId") Long teamId);
}
