package stirling.software.saas.procurement.repository;

import java.util.List;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Sort;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.saas.procurement.model.ProcurementAgreementSignature;

/** Agreement signatures. Migrated from a Spring Data {@code JpaRepository}. */
@ApplicationScoped
public class ProcurementAgreementSignatureRepository
        implements PanacheRepositoryBase<ProcurementAgreementSignature, Long> {

    /**
     * Persist-or-update an entity and return the managed instance. Replaces the Spring Data {@code
     * save} convenience: for a managed/updated entity, mutations are flushed by the active
     * transaction; for a new entity, {@code persist} attaches it.
     */
    public ProcurementAgreementSignature save(ProcurementAgreementSignature entity) {
        if (entity != null && !isPersistent(entity)) {
            persist(entity);
        }
        return entity;
    }

    public Optional<ProcurementAgreementSignature> findFirstByDealIdOrderBySignedAtDesc(
            Long dealId) {
        return find("dealId = ?1", Sort.descending("signedAt"), dealId).firstResultOptional();
    }

    public Optional<ProcurementAgreementSignature> findFirstByQuoteIdOrderBySignedAtDesc(
            Long quoteId) {
        return find("quoteId = ?1", Sort.descending("signedAt"), quoteId).firstResultOptional();
    }

    /**
     * Version labels of a deal's signatures, newest first. Projects just the label column so the
     * frequently-polled snapshot never loads the PDF bytes. A signature means the agreement is
     * signed; the PDF is resolved (stored or re-rendered) at download time.
     */
    public List<String> findSignedLabels(Long dealId) {
        return getEntityManager()
                .createQuery(
                        "SELECT s.documentLabel FROM ProcurementAgreementSignature s"
                                + " WHERE s.dealId = :dealId"
                                + " ORDER BY s.signedAt DESC",
                        String.class)
                .setParameter("dealId", dealId)
                .getResultList();
    }
}
