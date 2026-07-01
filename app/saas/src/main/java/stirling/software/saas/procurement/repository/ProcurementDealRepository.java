package stirling.software.saas.procurement.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import stirling.software.saas.procurement.model.ProcurementDeal;

public interface ProcurementDealRepository extends JpaRepository<ProcurementDeal, Long> {

    Optional<ProcurementDeal> findByTeamId(Long teamId);

    boolean existsByTeamId(Long teamId);
}
