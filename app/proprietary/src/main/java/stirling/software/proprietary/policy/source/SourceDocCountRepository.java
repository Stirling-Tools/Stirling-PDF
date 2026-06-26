package stirling.software.proprietary.policy.source;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface SourceDocCountRepository
        extends JpaRepository<SourceDocCountEntity, SourceDocCountId> {

    /** Add to an existing bucket; returns the number of rows updated (0 when the bucket is new). */
    @Modifying
    @Query(
            "update SourceDocCountEntity e set e.docCount = e.docCount + :docs"
                    + " where e.sourceId = :sourceId and e.bucketHour = :bucketHour")
    int increment(
            @Param("sourceId") String sourceId,
            @Param("bucketHour") long bucketHour,
            @Param("docs") long docs);

    /** Lifetime document total per source, for the given sources. */
    @Query(
            "select new stirling.software.proprietary.policy.source.SourceDocSum("
                    + "e.sourceId, sum(e.docCount))"
                    + " from SourceDocCountEntity e where e.sourceId in :ids group by e.sourceId")
    List<SourceDocSum> sumBySource(@Param("ids") Collection<String> ids);

    /**
     * Hourly buckets at or after {@code since} (hours-since-epoch) for the given sources. The
     * caller derives the 24h / 30d windows and the daily series from these, so one read covers all
     * three.
     */
    @Query(
            "select e from SourceDocCountEntity e"
                    + " where e.sourceId in :ids and e.bucketHour >= :since")
    List<SourceDocCountEntity> bucketsSince(
            @Param("ids") Collection<String> ids, @Param("since") long since);
}
