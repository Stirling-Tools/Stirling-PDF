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

    // Window sizes as a count of hourly buckets, inclusive of the current (partial) hour.
    private static final long HOURS_IN_24H = 24;
    private static final long HOURS_IN_30D = 24 * 30;

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
        Map<String, Long> total = sums(repository.sumBySource(sourceIds));
        Map<String, Long> last24h =
                sums(repository.sumBySourceSince(sourceIds, now - (HOURS_IN_24H - 1)));
        Map<String, Long> last30d =
                sums(repository.sumBySourceSince(sourceIds, now - (HOURS_IN_30D - 1)));

        Map<String, DocStats> stats = new HashMap<>();
        for (String id : sourceIds) {
            stats.put(
                    id,
                    new DocStats(
                            total.getOrDefault(id, 0L),
                            last24h.getOrDefault(id, 0L),
                            last30d.getOrDefault(id, 0L)));
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
}
