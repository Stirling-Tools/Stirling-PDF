package stirling.software.saas.procurement.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import stirling.software.saas.procurement.model.ProcurementDeal;

public interface ProcurementDealRepository extends JpaRepository<ProcurementDeal, Long> {

    Optional<ProcurementDeal> findByTeamId(Long teamId);

    /** Serializes trial changes and payment callbacks against the accepted agreement. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM ProcurementDeal d WHERE d.teamId = :teamId")
    Optional<ProcurementDeal> findByTeamIdForUpdate(@Param("teamId") Long teamId);

    boolean existsByTeamId(Long teamId);

    /** Reset: drop the team's deal (quotes + activity cascade via FK). */
    void deleteByTeamId(Long teamId);
}
