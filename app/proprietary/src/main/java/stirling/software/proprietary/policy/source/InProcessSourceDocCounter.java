package stirling.software.proprietary.policy.source;

import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * In-memory {@link SourceDocCounter} for tests and any future no-database mode. Holds hourly
 * buckets per source; the clock is injectable so window boundaries can be exercised
 * deterministically. {@link JpaSourceDocCounter} is the runtime bean.
 */
public class InProcessSourceDocCounter implements SourceDocCounter {

    private static final long HOURS_IN_24H = 24;
    private static final long HOURS_IN_30D = 24 * 30;

    private final Supplier<Instant> clock;
    private final Map<String, Map<Long, Long>> bucketsBySource = new ConcurrentHashMap<>();

    public InProcessSourceDocCounter() {
        this(Instant::now);
    }

    public InProcessSourceDocCounter(Supplier<Instant> clock) {
        this.clock = clock;
    }

    @Override
    public void record(String sourceId, long docs) {
        if (docs <= 0) {
            return;
        }
        bucketsBySource
                .computeIfAbsent(sourceId, key -> new ConcurrentHashMap<>())
                .merge(currentHour(), docs, Long::sum);
    }

    @Override
    public Map<String, DocStats> statsFor(Collection<String> sourceIds) {
        long now = currentHour();
        Map<String, DocStats> stats = new HashMap<>();
        for (String id : sourceIds) {
            Map<Long, Long> buckets = bucketsBySource.getOrDefault(id, Map.of());
            long total = buckets.values().stream().mapToLong(Long::longValue).sum();
            stats.put(
                    id,
                    new DocStats(
                            total,
                            sumSince(buckets, now - (HOURS_IN_24H - 1)),
                            sumSince(buckets, now - (HOURS_IN_30D - 1))));
        }
        return stats;
    }

    private static long sumSince(Map<Long, Long> buckets, long since) {
        return buckets.entrySet().stream()
                .filter(entry -> entry.getKey() >= since)
                .mapToLong(Map.Entry::getValue)
                .sum();
    }

    private long currentHour() {
        return clock.get().getEpochSecond() / 3600;
    }
}
