package stirling.software.saas.procurement.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import stirling.software.saas.procurement.model.ProcurementAgreementSignature;

public interface ProcurementAgreementSignatureRepository
        extends JpaRepository<ProcurementAgreementSignature, Long> {

    Optional<ProcurementAgreementSignature> findFirstByDealIdOrderBySignedAtDesc(Long dealId);

    Optional<ProcurementAgreementSignature> findFirstByQuoteIdOrderBySignedAtDesc(Long quoteId);
}
