package stirling.software.proprietary.policy.source;

import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

/**
 * Durable {@link SourceDocCounter} backed by hourly buckets in {@link SourceDocCountEntity}; the
 * runtime bean. Recording is an atomic increment, falling back to an insert for a new hour bucket
 * (and re-incrementing if a concurrent run won the insert). Rolling totals are summed from the
 * buckets, so storage stays bounded to roughly one row per source per active hour.
 */
@Service
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class JpaSourceDocCounter implements SourceDocCounter {

    // The widest window we report, as a count of hourly buckets back from now (inclusive); it spans
    // the 30-day daily series.
    private static final long WINDOW_HOURS = 24L * DocStats.DAYS;

    private final SourceDocCountRepository repository;
    private final Supplier<Instant> clock;

    @Autowired
    public JpaSourceDocCounter(SourceDocCountRepository repository) {
        this(repository, Instant::now);
    }

    // Clock seam so tests can pin "now"; the runtime bean uses the wall clock above.
    JpaSourceDocCounter(SourceDocCountRepository repository, Supplier<Instant> clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Override
    public void record(String sourceId, long docs) {
        if (docs <= 0) {
            return;
        }
        long bucketHour = currentHour();
        if (repository.increment(sourceId, bucketHour, docs) > 0) {
            return;
        }
        // No bucket for this hour yet: insert one. saveAndFlush forces the INSERT now (in its own
        // transaction) so a concurrent run's winning insert surfaces here as a constraint violation
        // rather than at a later commit. record() is deliberately not @Transactional, so the retry
        // increment below runs in a fresh transaction instead of a doomed rollback-only one.
        try {
            repository.saveAndFlush(new SourceDocCountEntity(sourceId, bucketHour, docs));
        } catch (DataIntegrityViolationException concurrentInsert) {
            // Another run created the bucket between our increment and insert; add to it now.
            repository.increment(sourceId, bucketHour, docs);
        }
    }

    @Override
    public Map<String, DocStats> statsFor(Collection<String> sourceIds) {
        if (sourceIds.isEmpty()) {
            return Map.of();
        }
        long now = currentHour();
        Map<String, Long> totals = sums(repository.sumBySource(sourceIds));
        Map<String, Long> last24h =
                sums(
                        repository.sumBySourceSince(
                                sourceIds, now - (SourceDocWindows.HOURS_IN_24H - 1)));
        Map<String, Map<Long, Long>> dailyCounts =
                dailyBySource(repository.dailyCountsSince(sourceIds, now - (WINDOW_HOURS - 1)));

        long currentDay = now / 24;
        Map<String, DocStats> stats = new HashMap<>();
        for (String id : sourceIds) {
            stats.put(
                    id,
                    SourceDocWindows.compute(
                            totals.getOrDefault(id, 0L),
                            last24h.getOrDefault(id, 0L),
                            dailyCounts.getOrDefault(id, Map.of()),
                            currentDay));
        }
        return stats;
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
