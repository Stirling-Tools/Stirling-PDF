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
public interface SourceDocTotalRepository extends JpaRepository<SourceDocTotalEntity, String> {

    /**
     * Add to a source's lifetime total; returns the number of rows updated (0 when the source has
     * no total row yet). Transactional per call so {@code JpaSourceDocCounter.record} can run it
     * (and the retry after a concurrent insert) without an enclosing transaction.
     */
    @Modifying
    @Transactional
    @Query(
            "update SourceDocTotalEntity e set e.docTotal = e.docTotal + :docs"
                    + " where e.sourceId = :sourceId")
    int increment(@Param("sourceId") String sourceId, @Param("docs") long docs);

    /** Lifetime totals for the given sources, as {@code (sourceId, total)} rows. */
    @Query(
            "select new stirling.software.proprietary.policy.source.SourceDocSum("
                    + "e.sourceId, e.docTotal)"
                    + " from SourceDocTotalEntity e where e.sourceId in :ids")
    List<SourceDocSum> totalsFor(@Param("ids") Collection<String> ids);
}
