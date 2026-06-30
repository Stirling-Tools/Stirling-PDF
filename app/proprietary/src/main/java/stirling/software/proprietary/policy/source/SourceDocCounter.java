package stirling.software.proprietary.policy.source;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * Records and reports how many documents each source feeds into runs. Counting is bucketed by hour
 * so the overview can report rolling totals ({@link DocStats}) cheaply; {@link JpaSourceDocCounter}
 * is the runtime bean and {@link InProcessSourceDocCounter} backs tests.
 */
public interface SourceDocCounter {

    /** Record that {@code docs} documents were fed from {@code sourceId} at the current time. */
    void record(String sourceId, long docs);

    /**
     * Document totals for each given source; a source with no recorded docs maps to {@link
     * DocStats#ZERO}.
     */
    Map<String, DocStats> statsFor(Collection<String> sourceIds);

    /**
     * The trailing {@link DocStats#DAYS}-day daily document series for one source, oldest first,
     * for the detail-panel sparkline.
     */
    List<Long> dailySeriesFor(String sourceId);
}
