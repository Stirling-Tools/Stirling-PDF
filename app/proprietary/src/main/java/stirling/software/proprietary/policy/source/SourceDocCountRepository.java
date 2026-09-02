package stirling.software.proprietary.policy.source;

import java.util.Collection;
import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Parameters;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

@ApplicationScoped
public class SourceDocCountRepository
        implements PanacheRepositoryBase<SourceDocCountEntity, SourceDocCountId> {

    /**
     * Add to an existing bucket; returns the number of rows updated (0 when the bucket is new).
     * Transactional per call so {@code JpaSourceDocCounter.record} can run it (and the retry after
     * a concurrent insert) without an enclosing transaction.
     */
    @Transactional
    public int increment(String sourceId, long bucketHour, long docs) {
        return update(
                "update SourceDocCountEntity e set e.docCount = e.docCount + :docs"
                        + " where e.sourceId = :sourceId and e.bucketHour = :bucketHour",
                Parameters.with("sourceId", sourceId)
                        .and("bucketHour", bucketHour)
                        .and("docs", docs));
    }

    /**
     * Delete hourly buckets older than {@code floor} (hours-since-epoch). Nothing reads buckets
     * before the 30-day window ({@code SourceDocWindows.firstDayHour}); the lifetime total lives in
     * {@code policy_source_doc_totals}, so retiring old buckets keeps the table bounded without
     * losing any reported figure.
     */
    @Transactional
    public int deleteOlderThan(long floor) {
        return (int)
                delete(
                        "delete from SourceDocCountEntity e where e.bucketHour < :floor",
                        Parameters.with("floor", floor));
    }

    /**
     * Document total per source restricted to buckets at or after {@code since} (the 24h window).
     */
    public List<SourceDocSum> sumBySourceSince(Collection<String> ids, long since) {
        // Constructor expression, so the rows come back as SourceDocSum: run it through the
        // EntityManager to keep that typing.
        return getEntityManager()
                .createQuery(
                        "select new stirling.software.proprietary.policy.source.SourceDocSum("
                                + "e.sourceId, sum(e.docCount))"
                                + " from SourceDocCountEntity e"
                                + " where e.sourceId in :ids and e.bucketHour >= :since"
                                + " group by e.sourceId",
                        SourceDocSum.class)
                .setParameter("ids", ids)
                .setParameter("since", since)
                .getResultList();
    }

    /**
     * Per-source, per-day document totals for buckets at or after {@code since}, summed in the
     * database so the overview reads ~one row per source per active day instead of per active hour.
     * The day is {@code cast(floor(bucketHour / 24.0) as long)}: {@code 24.0} forces decimal
     * division and the cast pins the result to a whole day on every dialect.
     */
    public List<SourceDayDocSum> dailyCountsSince(Collection<String> ids, long since) {
        return getEntityManager()
                .createQuery(
                        "select new stirling.software.proprietary.policy.source.SourceDayDocSum("
                                + "e.sourceId, cast(floor(e.bucketHour / 24.0) as long),"
                                + " sum(e.docCount))"
                                + " from SourceDocCountEntity e"
                                + " where e.sourceId in :ids and e.bucketHour >= :since"
                                + " group by cast(floor(e.bucketHour / 24.0) as long), e.sourceId",
                        SourceDayDocSum.class)
                .setParameter("ids", ids)
                .setParameter("since", since)
                .getResultList();
    }

    /**
     * Spring Data's {@code saveAndFlush}. {@code persist} always INSERTs, which is what the entity
     * asked for by reporting itself as new, and the flush surfaces a concurrent insert's constraint
     * violation here so the caller can retry it as an increment.
     */
    @Transactional
    public SourceDocCountEntity saveAndFlush(SourceDocCountEntity row) {
        persistAndFlush(row);
        return row;
    }
}
