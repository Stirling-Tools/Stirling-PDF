package stirling.software.proprietary.policy.source;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

/**
 * Exercises {@link JpaSourceDocCounter} against a real (H2) database so the daily-aggregate query
 * ({@code cast(floor(bucketHour / 24.0) as long)} grouping) and the record upsert are actually run,
 * not just asserted against a mock. The unit-level window math lives in {@link
 * InProcessSourceDocCounterTest}.
 */
@DataJpaTest
class JpaSourceDocCounterDbTest {

    // Pinned "now" so seeding and statsFor agree regardless of when the test runs (no hour-tick
    // flake at the boundary of a wall-clock hour).
    private static final Instant NOW = Instant.parse("2026-06-30T12:00:00Z");
    private static final long NOW_HOUR = NOW.getEpochSecond() / 3600;

    @Autowired private SourceDocCountRepository repository;

    private JpaSourceDocCounter counter() {
        return new JpaSourceDocCounter(repository, () -> NOW);
    }

    @Test
    void recordCreatesThenIncrementsTheCurrentHourBucket() {
        JpaSourceDocCounter counter = counter();
        counter.record("s", 5);
        counter.record("s", 3);

        DocStats stats = counter.statsFor(List.of("s")).get("s");
        assertEquals(8, stats.total());
        assertEquals(8, stats.last24h());
        assertEquals(8, stats.last30d());
        assertEquals(8L, stats.dailySeries().get(DocStats.DAYS - 1));
    }

    @Test
    void statsBucketDocsByDayAndWindowFromTheDatabase() {
        // Seed buckets directly at controlled hours: today, 10 days ago, 40 days ago.
        repository.saveAndFlush(new SourceDocCountEntity("s", NOW_HOUR, 7));
        repository.saveAndFlush(new SourceDocCountEntity("s", NOW_HOUR - 24L * 10, 50));
        repository.saveAndFlush(new SourceDocCountEntity("s", NOW_HOUR - 24L * 40, 100));

        DocStats stats = counter().statsFor(List.of("s")).get("s");
        assertEquals(157, stats.total());
        assertEquals(7, stats.last24h());
        assertEquals(57, stats.last30d());

        List<Long> series = stats.dailySeries();
        assertEquals(DocStats.DAYS, series.size());
        assertEquals(7L, series.get(DocStats.DAYS - 1)); // today
        assertEquals(50L, series.get(DocStats.DAYS - 11)); // 10 days ago
        assertEquals(57L, series.stream().mapToLong(Long::longValue).sum());
    }

    @Test
    void aSourceWithNoRecordedDocsIsZero() {
        assertEquals(DocStats.ZERO, counter().statsFor(List.of("unknown")).get("unknown"));
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage
    static class TestApp {}
}
