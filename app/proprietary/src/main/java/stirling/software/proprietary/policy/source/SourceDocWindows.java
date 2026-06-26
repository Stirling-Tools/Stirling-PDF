package stirling.software.proprietary.policy.source;

import java.util.Arrays;
import java.util.Map;

/**
 * Shared rolling-window math over a source's hourly document buckets, so the JPA and in-memory
 * counters agree on what "last 24h", "last 30d" and the daily series mean.
 */
final class SourceDocWindows {

    private static final long HOURS_IN_24H = 24;
    private static final long HOURS_IN_30D = 24L * DocStats.DAYS;

    private SourceDocWindows() {}

    /**
     * Build a {@link DocStats} from a source's hourly buckets (keyed by hours-since-epoch) and its
     * lifetime {@code total}. {@code nowHour} is the current hour bucket; windows and the daily
     * series are measured back from it.
     */
    static DocStats compute(long total, Map<Long, Long> hourlyCounts, long nowHour) {
        long last24h = sumSince(hourlyCounts, nowHour - (HOURS_IN_24H - 1));
        long last30d = sumSince(hourlyCounts, nowHour - (HOURS_IN_30D - 1));

        long firstDay = (nowHour / 24) - (DocStats.DAYS - 1);
        long[] daily = new long[DocStats.DAYS];
        for (Map.Entry<Long, Long> bucket : hourlyCounts.entrySet()) {
            int dayIndex = (int) (bucket.getKey() / 24 - firstDay);
            if (dayIndex >= 0 && dayIndex < DocStats.DAYS) {
                daily[dayIndex] += bucket.getValue();
            }
        }
        return new DocStats(total, last24h, last30d, Arrays.stream(daily).boxed().toList());
    }

    private static long sumSince(Map<Long, Long> hourlyCounts, long since) {
        return hourlyCounts.entrySet().stream()
                .filter(entry -> entry.getKey() >= since)
                .mapToLong(Map.Entry::getValue)
                .sum();
    }
}
