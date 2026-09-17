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
    @Modifying
    @Query(
            value =
                    "UPDATE stirling_pdf.saas_team_extensions e SET seats_used = seats_used + 1 "
                            + "WHERE team_id = :teamId AND seats_used + (SELECT COALESCE(SUM(i.seat_count), 0) "
                            + "FROM stirling_pdf.linked_instance i WHERE i.team_id = e.team_id AND i.revoked_at IS NULL) < max_seats",
            nativeQuery = true)
    int incrementSeatsUsed(@Param("teamId") Long teamId);

    @Query(
            value =
                    "SELECT e.seats_used + (SELECT COALESCE(SUM(i.seat_count), 0) FROM stirling_pdf.linked_instance i WHERE i.team_id=e.team_id AND i.revoked_at IS NULL) FROM stirling_pdf.saas_team_extensions e WHERE e.team_id=:teamId",
            nativeQuery = true)
    Long fleetUsersInUse(@Param("teamId") Long teamId);

    @Query(
            value =
                    "SELECT e.seats_used + (SELECT COALESCE(SUM(i.seat_count), 0) FROM stirling_pdf.linked_instance i WHERE i.team_id=e.team_id AND i.revoked_at IS NULL) < e.max_seats FROM stirling_pdf.saas_team_extensions e WHERE e.team_id=:teamId",
            nativeQuery = true)
    Boolean fleetHasAvailableSeats(@Param("teamId") Long teamId);

    /** Atomic seat decrement. Floor at 0. Returns 1 on a real decrement, 0 if already at 0. */
    @Modifying
    @Query(
            "UPDATE SaasTeamExtensions e SET e.seatsUsed = e.seatsUsed - 1 "
                    + "WHERE e.teamId = :teamId AND e.seatsUsed > 0")
    int decrementSeatsUsed(@Param("teamId") Long teamId);
}
