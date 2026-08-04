package stirling.software.proprietary.policy.source;

import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Parameters;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

@ApplicationScoped
public class SourceRepository implements PanacheRepositoryBase<SourceEntity, String> {

    /**
     * Sources belonging to a team, loaded without scanning every team's rows. A {@code null} teamId
     * matches the rows with no team (login-disabled / pre-team data), mirroring the in-memory team
     * filter rather than the empty result a plain {@code = null} would give.
     */
    public List<SourceEntity> findByTeam(Long teamId) {
        return list(
                "select s from SourceEntity s where (:teamId is null and s.teamId is null) or"
                        + " s.teamId = :teamId",
                Parameters.with("teamId", teamId));
    }

    /**
     * Spring Data {@code save(entity)}: transactional per call, inserting a new row and merging a
     * detached one, so re-saving a source with a known id updates it in place.
     */
    @Transactional
    public SourceEntity save(SourceEntity entity) {
        if (entity.getId() == null || getEntityManager().contains(entity)) {
            persist(entity);
            return entity;
        }
        return getEntityManager().merge(entity);
    }

    /** Spring Data {@code existsById(id)} -> Panache count by id. */
    public boolean existsById(String id) {
        return count("id", id) > 0;
    }
}
