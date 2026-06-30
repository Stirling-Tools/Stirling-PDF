package stirling.software.proprietary.policy.source;

import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.IntSupplier;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Durable {@link SourceDocCounter}; the runtime bean. {@code record} keeps two things in step: an
 * hourly bucket ({@link SourceDocCountEntity}) that feeds the rolling 24h / 30d / daily-series
 * windows, and a denormalized lifetime total ({@link SourceDocTotalEntity}) read directly for the
 * all-time figure. The lifetime counter means the overview never scans a source's whole bucket
 * history, and lets {@link #pruneOldBuckets()} retire buckets past the 30-day window so the hourly
 * table stays bounded (~one row per source per active hour, for at most 30 days).
 */
@Service
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class JpaSourceDocCounter implements SourceDocCounter {

    private final SourceDocCountRepository countRepository;
    private final SourceDocTotalRepository totalRepository;
    private final Supplier<Instant> clock;

    @Autowired
    public JpaSourceDocCounter(
            SourceDocCountRepository countRepository, SourceDocTotalRepository totalRepository) {
        this(countRepository, totalRepository, Instant::now);
    }

    // Clock seam so tests can pin "now"; the runtime bean uses the wall clock above.
    JpaSourceDocCounter(
            SourceDocCountRepository countRepository,
            SourceDocTotalRepository totalRepository,
            Supplier<Instant> clock) {
        this.countRepository = countRepository;
        this.totalRepository = totalRepository;
        this.clock = clock;
    }

    @Override
    public void record(String sourceId, long docs) {
        if (docs <= 0) {
            return;
        }
        long bucketHour = currentHour();
        upsert(
                () -> totalRepository.increment(sourceId, docs),
                () -> totalRepository.saveAndFlush(new SourceDocTotalEntity(sourceId, docs)));
        upsert(
                () -> countRepository.increment(sourceId, bucketHour, docs),
                () ->
                        countRepository.saveAndFlush(
                                new SourceDocCountEntity(sourceId, bucketHour, docs)));
    }

    /**
     * Add {@code docs} to a per-source running total: increment the existing row, else insert a new
     * one. The insert is flushed now (in its own transaction, since {@code record} is not
     * {@code @Transactional}) so a concurrent run's winning insert surfaces as a constraint
     * violation we retry as an increment, rather than as a silent {@code merge} overwrite or a
     * later doomed commit.
     */
    private static void upsert(IntSupplier increment, Runnable insert) {
        if (increment.getAsInt() > 0) {
            return;
        }
        try {
            insert.run();
        } catch (DataIntegrityViolationException concurrentInsert) {
            increment.getAsInt();
        }
    }

    @Override
    public Map<String, DocStats> statsFor(Collection<String> sourceIds) {
        if (sourceIds.isEmpty()) {
            return Map.of();
        }
        long now = currentHour();
        Map<String, Long> totals = sums(totalRepository.totalsFor(sourceIds));
        Map<String, Long> last24h =
                sums(
                        countRepository.sumBySourceSince(
                                sourceIds, now - (SourceDocWindows.HOURS_IN_24H - 1)));
        Map<String, Long> last30d =
                sums(
                        countRepository.sumBySourceSince(
                                sourceIds, SourceDocWindows.firstDayHour(now)));

        Map<String, DocStats> stats = new HashMap<>();
        for (String id : sourceIds) {
            stats.put(
                    id,
                    new DocStats(
                            totals.getOrDefault(id, 0L),
                            last24h.getOrDefault(id, 0L),
                            last30d.getOrDefault(id, 0L)));
        }
        return stats;
    }

    @Override
    public List<Long> dailySeriesFor(String sourceId) {
        long now = currentHour();
        Collection<String> ids = List.of(sourceId);
        Map<Long, Long> dailyCounts =
                dailyBySource(
                                countRepository.dailyCountsSince(
                                        ids, SourceDocWindows.firstDayHour(now)))
                        .getOrDefault(sourceId, Map.of());
        return SourceDocWindows.series(dailyCounts, now / 24);
    }

    /**
     * Retire hourly buckets older than the 30-day window; the lifetime total is held separately, so
     * nothing reported is lost. Daily is ample - the read queries already ignore older buckets, so
     * this is purely storage hygiene.
     */
    @Scheduled(fixedDelay = 1, timeUnit = TimeUnit.DAYS)
    public void pruneOldBuckets() {
        countRepository.deleteOlderThan(SourceDocWindows.firstDayHour(currentHour()));
    }

    private long currentHour() {
        return clock.get().getEpochSecond() / 3600;
    }

    private static Map<String, Long> sums(List<SourceDocSum> rows) {
        Map<String, Long> map = new HashMap<>();
        for (SourceDocSum row : rows) {
            map.put(row.sourceId(), row.count() == null ? 0L : row.count());
        }
        return map;
    }

    private static Map<String, Map<Long, Long>> dailyBySource(List<SourceDayDocSum> rows) {
        Map<String, Map<Long, Long>> bySource = new HashMap<>();
        for (SourceDayDocSum row : rows) {
            bySource.computeIfAbsent(row.sourceId(), key -> new HashMap<>())
                    .merge(row.day(), row.docs() == null ? 0L : row.docs(), Long::sum);
        }
        return bySource;
    }
}
