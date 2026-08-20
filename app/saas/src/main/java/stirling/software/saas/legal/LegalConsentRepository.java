package stirling.software.saas.legal;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;

/** Clickwrap consent records. Migrated from a Spring Data {@code JpaRepository}. */
@ApplicationScoped
public class LegalConsentRepository implements PanacheRepositoryBase<LegalConsent, Long> {

    /**
     * Persist-or-update an entity and return the managed instance. Replaces the Spring Data {@code
     * save} convenience: for a managed/updated entity, mutations are flushed by the active
     * transaction; for a new entity, {@code persist} attaches it.
     */
    public LegalConsent save(LegalConsent entity) {
        if (entity != null && !isPersistent(entity)) {
            persist(entity);
        }
        return entity;
    }
}
