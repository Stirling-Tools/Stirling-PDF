package stirling.software.proprietary.policy.source;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

/**
 * Tests the rolling-window aggregation: documents recorded at different times roll into the total
 * and the 24-hour / 30-day windows correctly as the clock advances.
 */
class InProcessSourceDocCounterTest {

    @Test
    void rollsCountsIntoTotalAnd24hAnd30dWindows() {
        AtomicReference<Instant> clock = new AtomicReference<>();
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
        DocStats stats = counter.statsFor(List.of("s")).get("s");

        assertEquals(157, stats.total());
        assertEquals(7, stats.last24h());
        assertEquals(57, stats.last30d());
    }

    @Test
    void aSourceWithNoRecordedDocsIsZero() {
        InProcessSourceDocCounter counter = new InProcessSourceDocCounter();
        assertEquals(DocStats.ZERO, counter.statsFor(List.of("unknown")).get("unknown"));
    }
}
