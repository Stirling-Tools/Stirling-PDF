package stirling.software.proprietary.policy.migration;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

@ApplicationScoped
public class CompletedMigrationRepository
        implements PanacheRepositoryBase<CompletedMigration, String> {

    /** Spring Data {@code existsById(id)} -> Panache count by id. */
    public boolean existsById(String id) {
        return count("id", id) > 0;
    }

    /**
     * Spring Data {@code save}: an assigned string id arrives detached, so merge rather than
     * blind-insert; the flush surfaces a duplicate-key clash here, where markDone catches it.
     */
    @Transactional
    public CompletedMigration save(CompletedMigration marker) {
        CompletedMigration saved;
        if (isPersistent(marker)) {
            persist(marker);
            saved = marker;
        } else {
            saved = getEntityManager().merge(marker);
        }
        flush();
        return saved;
    }
}
