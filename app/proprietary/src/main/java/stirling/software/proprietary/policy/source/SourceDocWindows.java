package stirling.software.proprietary.policy.source;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

/**
 * Shared rolling-window math over a source's document buckets, so the JPA and in-memory counters
 * agree on what "last 24h", "last 30d" and the daily series mean. The JPA counter aggregates by day
 * in SQL; the in-memory counter groups its hourly buckets with {@link #byDay}; both then feed
 * {@link #compute}.
 */
final class SourceDocWindows {

    static final long HOURS_IN_24H = 24;

    private SourceDocWindows() {}

    /**
     * Build a {@link DocStats} from per-day document counts (keyed by epoch-day, i.e.
     * hours-since-epoch / 24) plus the lifetime {@code total} and {@code last24h} the caller
     * already summed. {@code currentDay} is today's epoch-day; the series runs back {@link
     * DocStats#DAYS} days from it. {@code last30d} is the sum of that series, so the "last 30 days"
     * total and the sparkline always agree.
     */
    static DocStats compute(
            long total, long last24h, Map<Long, Long> dailyCounts, long currentDay) {
        long firstDay = currentDay - (DocStats.DAYS - 1);
        long[] daily = new long[DocStats.DAYS];
        for (Map.Entry<Long, Long> day : dailyCounts.entrySet()) {
            int dayIndex = (int) (day.getKey() - firstDay);
            if (dayIndex >= 0 && dayIndex < DocStats.DAYS) {
                daily[dayIndex] += day.getValue();
            }
        }
        long last30d = Arrays.stream(daily).sum();
        return new DocStats(total, last24h, last30d, Arrays.stream(daily).boxed().toList());
    }

    /** Collapse hourly buckets (keyed by hours-since-epoch) into per-day counts (keyed by day). */
    static Map<Long, Long> byDay(Map<Long, Long> hourlyCounts) {
        Map<Long, Long> dailyCounts = new HashMap<>();
        hourlyCounts.forEach((hour, count) -> dailyCounts.merge(hour / 24, count, Long::sum));
        return dailyCounts;
    }

    /** Sum hourly buckets at or after {@code since} (hours-since-epoch). */
    static long sumSince(Map<Long, Long> hourlyCounts, long since) {
        return hourlyCounts.entrySet().stream()
                .filter(entry -> entry.getKey() >= since)
                .mapToLong(Map.Entry::getValue)
                .sum();
    }
}
