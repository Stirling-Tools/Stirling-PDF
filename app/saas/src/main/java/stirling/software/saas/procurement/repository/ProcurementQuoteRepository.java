package stirling.software.saas.procurement.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import stirling.software.saas.procurement.model.ProcurementQuote;

public interface ProcurementQuoteRepository extends JpaRepository<ProcurementQuote, Long> {

    List<ProcurementQuote> findByDealIdOrderByCreatedAtDesc(Long dealId);

    /** Revision number for the deal's next quote; a count, so numbering never loads every row. */
    long countByDealId(Long dealId);
}
