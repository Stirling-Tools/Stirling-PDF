package stirling.software.proprietary.policy.source;

/**
 * Per-source document throughput for the overview row: how many documents a source has fed into
 * runs in total and over the trailing 24-hour and 30-day windows. Counts documents <em>fed</em>
 * (picked up by a run), so a snapshot-mode source that re-reads the same files each run counts them
 * per run.
 */
public record DocStats(long total, long last24h, long last30d) {

    /** Number of trailing daily buckets in a source's daily series. */
    public static final int DAYS = 30;

    public static final DocStats ZERO = new DocStats(0, 0, 0);
}
