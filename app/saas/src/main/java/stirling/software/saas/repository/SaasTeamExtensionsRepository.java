package stirling.software.saas.repository;

import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.saas.model.SaasTeamExtensions;

@ApplicationScoped
public class SaasTeamExtensionsRepository
        implements PanacheRepositoryBase<SaasTeamExtensions, Long> {

    public Optional<SaasTeamExtensions> findByTeamId(Long teamId) {
        return find("teamId = ?1", teamId).firstResultOptional();
    }

    /**
     * Atomic seat increment. Personal teams enforce a strict seatsUsed < maxSeats ceiling; standard
     * (non-personal) teams have no cap. Returns 1 on success, 0 if the cap was hit.
     */
    @Transactional
    public int incrementSeatsUsed(Long teamId) {
        return (int)
                update(
                        "seatsUsed = seatsUsed + 1 WHERE teamId = ?1 AND (isPersonal = TRUE AND seatsUsed < maxSeats OR isPersonal = FALSE)",
                        teamId);
    }

    /** Atomic seat decrement. Floor at 0. Returns 1 on a real decrement, 0 if already at 0. */
    @Transactional
    public int decrementSeatsUsed(Long teamId) {
        return (int)
                update("seatsUsed = seatsUsed - 1 WHERE teamId = ?1 AND seatsUsed > 0", teamId);
    }
}
