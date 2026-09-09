package stirling.software.proprietary.policy.source;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Shared rolling-window math over a source's document buckets, so the JPA and in-memory counters
 * agree on the window boundaries and the daily series. Both define "last 30 days" as the buckets at
 * or after {@link #firstDayHour}, and build the series from per-day counts with {@link #series}
 * (the JPA counter aggregates by day in SQL; the in-memory counter groups its hourly buckets with
 * {@link #byDay}).
 */
final class SourceDocWindows {

    static final long HOURS_IN_24H = 24;

    private SourceDocWindows() {}

    /**
     * The hours-since-epoch at the start of the oldest day in the 30-day window, given the current
     * hour bucket. Both the "last 30 days" total and the daily series are measured from here, so
     * the KPI and the sparkline always cover the same buckets.
     */
    static long firstDayHour(long nowHour) {
        return ((nowHour / 24) - (DocStats.DAYS - 1)) * 24;
    }

    /**
     * Build the {@link DocStats#DAYS}-day daily series (oldest first) from per-day document counts
     * (keyed by epoch-day, i.e. hours-since-epoch / 24). {@code currentDay} is today's epoch-day;
     * the series runs back {@code DAYS} days from it.
     */
    static List<Long> series(Map<Long, Long> dailyCounts, long currentDay) {
        long firstDay = currentDay - (DocStats.DAYS - 1);
        long[] daily = new long[DocStats.DAYS];
        for (Map.Entry<Long, Long> day : dailyCounts.entrySet()) {
            int dayIndex = (int) (day.getKey() - firstDay);
            if (dayIndex >= 0 && dayIndex < DocStats.DAYS) {
                daily[dayIndex] += day.getValue();
            }
        }
        return Arrays.stream(daily).boxed().toList();
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
