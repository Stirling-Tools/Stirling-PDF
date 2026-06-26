package stirling.software.proprietary.policy.source;

import java.util.Collections;
import java.util.List;

/**
 * Per-source document throughput: how many documents a source has fed into runs in total and over
 * the trailing 24-hour and 30-day windows, plus {@code dailySeries} - a {@link #DAYS}-entry count
 * per day (oldest first) for a sparkline. Counts documents <em>fed</em> (picked up by a run), so a
 * snapshot-mode source that re-reads the same files each run counts them per run.
 */
public record DocStats(long total, long last24h, long last30d, List<Long> dailySeries) {

    /** Number of trailing daily buckets in {@link #dailySeries}. */
    public static final int DAYS = 30;

    public static final DocStats ZERO = new DocStats(0, 0, 0, Collections.nCopies(DAYS, 0L));
}
