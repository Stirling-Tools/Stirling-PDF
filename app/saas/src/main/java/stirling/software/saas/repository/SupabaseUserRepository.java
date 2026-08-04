package stirling.software.saas.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.saas.model.SupabaseUser;

@ApplicationScoped
public class SupabaseUserRepository implements PanacheRepositoryBase<SupabaseUser, UUID> {

    /**
     * Anonymous users created before the cut-off date. Used by the cleanup job to drop stale
     * anonymous sessions in batch (avoids long-running transactions on a single big delete).
     */
    public Stream<UUID> findByCreatedAtBeforeAndIsAnonymousTrue(LocalDateTime cutoffDate) {
        return find("isAnonymous = true AND createdAt < ?1", cutoffDate).<SupabaseUser>stream()
                .map(s -> s.getId());
    }

    @Transactional
    public void deleteAllByIdInBatch(List<UUID> ids) {
        delete("id IN ?1", ids);
    }
}
