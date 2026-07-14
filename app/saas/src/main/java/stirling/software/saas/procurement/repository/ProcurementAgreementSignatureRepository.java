package stirling.software.saas.procurement.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import stirling.software.saas.procurement.model.ProcurementAgreementSignature;

public interface ProcurementAgreementSignatureRepository
        extends JpaRepository<ProcurementAgreementSignature, Long> {

    Optional<ProcurementAgreementSignature> findFirstByDealIdOrderBySignedAtDesc(Long dealId);

    Optional<ProcurementAgreementSignature> findFirstByQuoteIdOrderBySignedAtDesc(Long quoteId);

    /**
     * Version labels of a deal's signatures that have a stored PDF, newest first. Projects just the
     * label column so the frequently-polled snapshot never loads the PDF bytes.
     */
    @Query(
            "SELECT s.documentLabel FROM ProcurementAgreementSignature s"
                    + " WHERE s.dealId = :dealId AND s.pdf IS NOT NULL"
                    + " ORDER BY s.signedAt DESC")
    List<String> findDownloadableLabels(@Param("dealId") Long dealId);
}
