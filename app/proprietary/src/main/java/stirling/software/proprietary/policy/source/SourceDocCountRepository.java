package stirling.software.proprietary.policy.source;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public interface SourceDocCountRepository
        extends JpaRepository<SourceDocCountEntity, SourceDocCountId> {

    /**
     * Add to an existing bucket; returns the number of rows updated (0 when the bucket is new).
     * Transactional per call so {@code JpaSourceDocCounter.record} can run it (and the retry after
     * a concurrent insert) without an enclosing transaction.
     */
    @Modifying
    @Transactional
    @Query(
            "update SourceDocCountEntity e set e.docCount = e.docCount + :docs"
                    + " where e.sourceId = :sourceId and e.bucketHour = :bucketHour")
    int increment(
            @Param("sourceId") String sourceId,
            @Param("bucketHour") long bucketHour,
            @Param("docs") long docs);

    /**
     * Delete hourly buckets older than {@code floor} (hours-since-epoch). Nothing reads buckets
     * before the 30-day window ({@code SourceDocWindows.firstDayHour}); the lifetime total lives in
     * {@code policy_source_doc_totals}, so retiring old buckets keeps the table bounded without
     * losing any reported figure.
     */
    @Modifying
    @Transactional
    @Query("delete from SourceDocCountEntity e where e.bucketHour < :floor")
    int deleteOlderThan(@Param("floor") long floor);

    /**
     * Document total per source restricted to buckets at or after {@code since} (the 24h window).
     */
    @Query(
            "select new stirling.software.proprietary.policy.source.SourceDocSum("
                    + "e.sourceId, sum(e.docCount))"
                    + " from SourceDocCountEntity e"
                    + " where e.sourceId in :ids and e.bucketHour >= :since"
                    + " group by e.sourceId")
    List<SourceDocSum> sumBySourceSince(
            @Param("ids") Collection<String> ids, @Param("since") long since);

    /**
     * Per-source, per-day document totals for buckets at or after {@code since}, summed in the
     * database so the overview reads ~one row per source per active day instead of per active hour.
     * The day is {@code cast(floor(bucketHour / 24.0) as long)}: {@code 24.0} forces decimal
     * division and the cast pins the result to a whole day on every dialect.
     */
    @Query(
            "select new stirling.software.proprietary.policy.source.SourceDayDocSum("
                    + "e.sourceId, cast(floor(e.bucketHour / 24.0) as long), sum(e.docCount))"
                    + " from SourceDocCountEntity e"
                    + " where e.sourceId in :ids and e.bucketHour >= :since"
                    + " group by cast(floor(e.bucketHour / 24.0) as long), e.sourceId")
    List<SourceDayDocSum> dailyCountsSince(
            @Param("ids") Collection<String> ids, @Param("since") long since);
}
