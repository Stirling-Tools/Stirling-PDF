package stirling.software.saas.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.saas.model.SaasTeamExtensions;

@Repository
public interface SaasTeamExtensionsRepository extends JpaRepository<SaasTeamExtensions, Long> {

    Optional<SaasTeamExtensions> findByTeamId(Long teamId);

    /**
     * Atomic seat increment. Standard (non-personal) teams have no cap; personal teams are also
     * uncapped unless a positive {@code maxSeats} is set ({@code <= 0} = unlimited), in which case
     * they enforce a strict {@code seatsUsed &lt; maxSeats} ceiling (mirrors {@link
     * SaasTeamExtensions#hasAvailableSeats()}). Returns 1 on success, 0 if the cap was hit.
     */
    @Modifying
    @Query(
            "UPDATE SaasTeamExtensions e SET e.seatsUsed = e.seatsUsed + 1 "
                    + "WHERE e.teamId = :teamId AND "
                    + "(e.isPersonal = FALSE OR e.maxSeats <= 0 OR e.seatsUsed < e.maxSeats)")
    int incrementSeatsUsed(@Param("teamId") Long teamId);

    /** Atomic seat decrement. Floor at 0. Returns 1 on a real decrement, 0 if already at 0. */
    @Modifying
    @Query(
            "UPDATE SaasTeamExtensions e SET e.seatsUsed = e.seatsUsed - 1 "
                    + "WHERE e.teamId = :teamId AND e.seatsUsed > 0")
    int decrementSeatsUsed(@Param("teamId") Long teamId);
}
