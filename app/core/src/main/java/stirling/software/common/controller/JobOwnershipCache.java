package stirling.software.common.controller;

import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import stirling.software.common.cluster.JobStoreEntry;

/**
 * Process-local TTL cache for {@link JobStoreEntry} lookups to suppress redundant Valkey HGETALL
 * round-trips on the hot result-download path (sticky-410 ownership check).
 *
 * <p>5 second TTL is short enough that a job's lifecycle transitions (RUNNING -> COMPLETE -> TTL
 * expiry) propagate to all nodes within the LB's sticky-session window, and short enough that a
 * mistakenly-cached "not found" recovers quickly when an entry actually shows up. Cap the map at
 * 2048 entries to bound memory; eviction is best-effort (clear-and-restart) since the cache is
 * advisory.
 */
final class JobOwnershipCache {

    private static final long TTL_NANOS = 5L * 1_000_000_000L; // 5 s
    private static final int MAX_ENTRIES = 2048;

    private final ConcurrentMap<String, Entry> entries = new ConcurrentHashMap<>();

    Optional<Optional<JobStoreEntry>> get(String jobId) {
        Entry e = entries.get(jobId);
        if (e == null) {
            return Optional.empty();
        }
        if (System.nanoTime() - e.storedAtNanos > TTL_NANOS) {
            entries.remove(jobId, e);
            return Optional.empty();
        }
        return Optional.of(e.value);
    }

    void put(String jobId, Optional<JobStoreEntry> value) {
        if (entries.size() >= MAX_ENTRIES) {
            // Best-effort eviction; under burst the cache simply rebuilds.
            entries.clear();
        }
        entries.put(jobId, new Entry(value, System.nanoTime()));
    }

    private record Entry(Optional<JobStoreEntry> value, long storedAtNanos) {}
}
