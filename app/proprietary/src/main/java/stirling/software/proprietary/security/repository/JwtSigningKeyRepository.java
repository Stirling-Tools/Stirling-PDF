package stirling.software.proprietary.security.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Sort;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.proprietary.security.model.JwtSigningKeyEntity;

/** Shared-DB store of JWT signing keys - the source of truth every cluster node reads from. */
@ApplicationScoped
public class JwtSigningKeyRepository implements PanacheRepositoryBase<JwtSigningKeyEntity, String> {

    /** Newest first, so the most recently created key is the active signing key. */
    public List<JwtSigningKeyEntity> findAllByOrderByCreatedAtDesc() {
        return listAll(Sort.descending("createdAt"));
    }

    /**
     * The current active signing key: the single newest row. Used for cheap cluster convergence.
     */
    public Optional<JwtSigningKeyEntity> findFirstByOrderByCreatedAtDesc() {
        return findAll(Sort.descending("createdAt")).firstResultOptional();
    }

    /** Keys created before the cutoff, eligible for rotation cleanup. */
    public List<JwtSigningKeyEntity> findByCreatedAtBefore(LocalDateTime cutoff) {
        return list("createdAt < ?1", cutoff);
    }

    /** Spring Data {@code save}: keyId is assigned, so merge inserts or updates as it did. */
    @Transactional
    public JwtSigningKeyEntity save(JwtSigningKeyEntity entity) {
        return getEntityManager().merge(entity);
    }
}
