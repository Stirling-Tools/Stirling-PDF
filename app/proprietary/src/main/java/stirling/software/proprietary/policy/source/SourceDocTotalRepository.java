package stirling.software.proprietary.policy.source;

import java.util.Collection;
import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Parameters;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

@ApplicationScoped
public class SourceDocTotalRepository
        implements PanacheRepositoryBase<SourceDocTotalEntity, String> {

    /**
     * Add to a source's lifetime total; returns the number of rows updated (0 when the source has
     * no total row yet). Transactional per call so {@code JpaSourceDocCounter.record} can run it
     * (and the retry after a concurrent insert) without an enclosing transaction.
     */
    @Transactional
    public int increment(String sourceId, long docs) {
        return update(
                "update SourceDocTotalEntity e set e.docTotal = e.docTotal + :docs"
                        + " where e.sourceId = :sourceId",
                Parameters.with("sourceId", sourceId).and("docs", docs));
    }

    /** Lifetime totals for the given sources, as {@code (sourceId, total)} rows. */
    public List<SourceDocSum> totalsFor(Collection<String> ids) {
        // Projection into a record, so it goes through the EntityManager rather than Panache.
        return getEntityManager()
                .createQuery(
                        "select new stirling.software.proprietary.policy.source.SourceDocSum("
                                + "e.sourceId, e.docTotal)"
                                + " from SourceDocTotalEntity e where e.sourceId in :ids",
                        SourceDocSum.class)
                .setParameter("ids", ids)
                .getResultList();
    }

    /**
     * Spring Data's {@code saveAndFlush} on an entity that always reported {@code isNew()}: a raw
     * INSERT, flushed so a concurrent insert surfaces here as a constraint violation to retry.
     */
    @Transactional
    public SourceDocTotalEntity saveAndFlush(SourceDocTotalEntity entity) {
        persistAndFlush(entity);
        return entity;
    }
}
