package stirling.software.proprietary.policy.source;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

/**
 * Tests the rolling-window aggregation: documents recorded at different times roll into the total,
 * the 24-hour / 30-day windows, and the daily series correctly as the clock advances.
 */
class InProcessSourceDocCounterTest {

    private static InProcessSourceDocCounter seededCounter(AtomicReference<Instant> clock) {
        InProcessSourceDocCounter counter = new InProcessSourceDocCounter(clock::get);
        // 40 days ago: outside the 30-day window.
        clock.set(Instant.parse("2026-05-21T12:00:00Z"));
        counter.record("s", 100);
        // 10 days ago: inside 30 days, outside 24 hours.
        clock.set(Instant.parse("2026-06-20T12:00:00Z"));
        counter.record("s", 50);
        // 2 hours ago: inside both windows.
        clock.set(Instant.parse("2026-06-30T10:00:00Z"));
        counter.record("s", 7);
        // Query as of "now".
        clock.set(Instant.parse("2026-06-30T12:00:00Z"));
        return counter;
    }

    @Test
    void rollsCountsIntoTotalAnd24hAnd30dWindows() {
        AtomicReference<Instant> clock = new AtomicReference<>();
        DocStats stats = seededCounter(clock).statsFor(List.of("s")).get("s");

        assertEquals(157, stats.total());
        assertEquals(7, stats.last24h());
        assertEquals(57, stats.last30d());
    }

    @Test
    void buildsTheDailySeriesOldestFirst() {
        AtomicReference<Instant> clock = new AtomicReference<>();
        // Today (index 29) and 10 days ago (index 19) only; 40 days ago is outside the window.
        List<Long> series = seededCounter(clock).dailySeriesFor("s");

        assertEquals(30, series.size());
        assertEquals(7L, series.get(29));
        assertEquals(50L, series.get(19));
        assertEquals(57L, series.stream().mapToLong(Long::longValue).sum());
    }

    @Test
    void aSourceWithNoRecordedDocsIsZero() {
        InProcessSourceDocCounter counter = new InProcessSourceDocCounter();
        assertEquals(DocStats.ZERO, counter.statsFor(List.of("unknown")).get("unknown"));
        assertEquals(Collections.nCopies(DocStats.DAYS, 0L), counter.dailySeriesFor("unknown"));
    }
}
