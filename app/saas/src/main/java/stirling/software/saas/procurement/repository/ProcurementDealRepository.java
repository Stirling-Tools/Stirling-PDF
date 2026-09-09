package stirling.software.saas.procurement.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import stirling.software.saas.procurement.model.ProcurementDeal;

public interface ProcurementDealRepository extends JpaRepository<ProcurementDeal, Long> {

    Optional<ProcurementDeal> findByTeamId(Long teamId);

    boolean existsByTeamId(Long teamId);

    /** Reset: drop the team's deal (quotes + activity cascade via FK). */
    void deleteByTeamId(Long teamId);
}
