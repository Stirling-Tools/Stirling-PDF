package stirling.software.saas.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import stirling.software.saas.model.SaasTeamExtensions;

public interface SaasTeamExtensionsRepository extends JpaRepository<SaasTeamExtensions, Long> {

    // A linked team needs one cloud owner even when everyone works on its self-hosted deployments.
    String CLOUD_SEATS =
            "GREATEST(e.seats_used - CASE WHEN EXISTS (SELECT 1 FROM stirling_pdf.linked_instance owner_link WHERE owner_link.team_id = e.team_id AND owner_link.revoked_at IS NULL) THEN 1 ELSE 0 END, 0)";
    String FLEET_SEATS =
            CLOUD_SEATS
                    + " + (SELECT COALESCE(SUM(i.seat_count), 0) FROM stirling_pdf.linked_instance i WHERE i.team_id = e.team_id AND i.revoked_at IS NULL)";

    Optional<SaasTeamExtensions> findByTeamId(Long teamId);

    /**
     * Atomic seat claim for every team type. Returns 1 on success, 0 when capacity is exhausted.
     */
    @Modifying
    @Query(
            value =
                    "UPDATE stirling_pdf.saas_team_extensions e SET seats_used = seats_used + 1 "
                            + "WHERE team_id = :teamId AND "
                            + FLEET_SEATS
                            + " < max_seats",
            nativeQuery = true)
    int incrementSeatsUsed(@Param("teamId") Long teamId);

    @Query(
            value =
                    "SELECT "
                            + FLEET_SEATS
                            + " FROM stirling_pdf.saas_team_extensions e WHERE e.team_id=:teamId",
            nativeQuery = true)
    Long fleetUsersInUse(@Param("teamId") Long teamId);

    @Query(
            value =
                    "SELECT "
                            + FLEET_SEATS
                            + " < e.max_seats FROM stirling_pdf.saas_team_extensions e WHERE e.team_id=:teamId",
            nativeQuery = true)
    Boolean fleetHasAvailableSeats(@Param("teamId") Long teamId);

    /** Atomic seat decrement. Floor at 0. Returns 1 on a real decrement, 0 if already at 0. */
    @Modifying
    @Query(
            "UPDATE SaasTeamExtensions e SET e.seatsUsed = e.seatsUsed - 1 "
                    + "WHERE e.teamId = :teamId AND e.seatsUsed > 0")
    int decrementSeatsUsed(@Param("teamId") Long teamId);
}
