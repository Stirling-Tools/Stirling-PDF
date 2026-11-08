package stirling.software.saas.procurement.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import stirling.software.saas.procurement.model.ProcurementActivity;

/** Persists staff actions in the existing commercial audit trail. */
public interface ProcurementActivityRepository extends JpaRepository<ProcurementActivity, Long> {}
