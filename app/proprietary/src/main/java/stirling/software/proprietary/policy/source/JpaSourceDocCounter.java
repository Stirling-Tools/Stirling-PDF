package stirling.software.proprietary.policy.source;

import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/**
 * Durable {@link SourceDocCounter} backed by hourly buckets in {@link SourceDocCountEntity}; the
 * runtime bean. Recording is an atomic increment, falling back to an insert for a new hour bucket
 * (and re-incrementing if a concurrent run won the insert). Rolling totals are summed from the
 * buckets, so storage stays bounded to roughly one row per source per active hour.
 */
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class JpaSourceDocCounter implements SourceDocCounter {

    // The widest window we report, as a count of hourly buckets back from now (inclusive). One
    // fetch of these covers the 24h / 30d totals and the daily series.
    private static final long WINDOW_HOURS = 24L * DocStats.DAYS;

    private final SourceDocCountRepository repository;

    @Override
    @Transactional
    public void record(String sourceId, long docs) {
        if (docs <= 0) {
            return;
        }
        long bucketHour = currentHour();
        if (repository.increment(sourceId, bucketHour, docs) > 0) {
            return;
        }
        try {
            repository.save(new SourceDocCountEntity(sourceId, bucketHour, docs));
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
        Map<String, Map<Long, Long>> windowBuckets =
                bucketsBySource(repository.bucketsSince(sourceIds, now - (WINDOW_HOURS - 1)));

        Map<String, DocStats> stats = new HashMap<>();
        for (String id : sourceIds) {
            stats.put(
                    id,
                    SourceDocWindows.compute(
                            totals.getOrDefault(id, 0L),
                            windowBuckets.getOrDefault(id, Map.of()),
                            now));
        }
        return stats;
    }

    private static long currentHour() {
        return Instant.now().getEpochSecond() / 3600;
    }

    private static Map<String, Long> sums(List<SourceDocSum> rows) {
        Map<String, Long> map = new HashMap<>();
        for (SourceDocSum row : rows) {
            map.put(row.sourceId(), row.count() == null ? 0L : row.count());
        }
        return map;
    }

    private static Map<String, Map<Long, Long>> bucketsBySource(
            List<SourceDocCountEntity> buckets) {
        Map<String, Map<Long, Long>> bySource = new HashMap<>();
        for (SourceDocCountEntity bucket : buckets) {
            bySource.computeIfAbsent(bucket.getSourceId(), key -> new HashMap<>())
                    .put(bucket.getBucketHour(), bucket.getDocCount());
        }
        return bySource;
    }
}
