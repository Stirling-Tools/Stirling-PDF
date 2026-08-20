package stirling.software.proprietary.policy.asset;

import java.util.List;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

/**
 * Quarkus Panache repository for {@link PolicyAssetEntity}.
 *
 * <p>Migrated from a Spring Data {@code JpaRepository<PolicyAssetEntity, String>}. The metadata
 * finders keep their original JPQL verbatim and run through the entity manager rather than Panache
 * {@code find}: they are constructor projections onto {@link PolicyAsset}, which is not an entity
 * type, so Panache's entity-typed query API cannot express them.
 */
@ApplicationScoped
public class PolicyAssetRepository implements PanacheRepositoryBase<PolicyAssetEntity, String> {

    /**
     * Metadata projection. Lists, validation and cleanup need only the fields, and selecting whole
     * entities would drag every asset's LOB (up to 50 MB each) along with them.
     */
    static final String META =
            "select new stirling.software.proprietary.policy.asset.PolicyAsset(a.id, a.fileName,"
                    + " a.contentType, a.fileSize, a.owner, a.teamId, a.createdAt) from"
                    + " PolicyAssetEntity a";

    public Optional<PolicyAsset> findMetaById(String id) {
        return getEntityManager()
                .createQuery(META + " where a.id = :id", PolicyAsset.class)
                .setParameter("id", id)
                .getResultStream()
                .findFirst();
    }

    /**
     * Assets belonging to a team, newest first. A {@code null} teamId matches the rows with no team
     * (login-disabled data), mirroring {@code PolicyRepository#findByTeam}.
     */
    public List<PolicyAsset> findMetaByTeam(Long teamId) {
        return getEntityManager()
                .createQuery(
                        META
                                + " where ((:teamId is null and a.teamId is null) or a.teamId ="
                                + " :teamId) order by a.createdAt desc, a.id asc",
                        PolicyAsset.class)
                .setParameter("teamId", teamId)
                .getResultList();
    }

    public List<PolicyAsset> findAllMeta() {
        return getEntityManager()
                .createQuery(META + " order by a.createdAt desc, a.id asc", PolicyAsset.class)
                .getResultList();
    }

    /** Ids of assets uploaded before {@code cutoff}, for the abandoned-upload sweep. */
    public List<String> findIdsCreatedBefore(long cutoff) {
        return getEntityManager()
                .createQuery(
                        "select a.id from PolicyAssetEntity a where a.createdAt < :cutoff",
                        String.class)
                .setParameter("cutoff", cutoff)
                .getResultList();
    }

    /**
     * Spring Data {@code save(entity)}. Panache {@code persist} inserts a new entity and relies on
     * dirty-checking to update a managed one; the returned instance keeps the original
     * save-returns-entity contract.
     */
    @Transactional
    public PolicyAssetEntity save(PolicyAssetEntity entity) {
        persist(entity);
        return entity;
    }
}
