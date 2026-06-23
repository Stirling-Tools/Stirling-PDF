package stirling.software.common.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentMap;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.cluster.JobStoreEntry;
import stirling.software.common.cluster.JobStoreEntry.JobState;

/**
 * Unit tests for the package-private process-local TTL cache {@link JobOwnershipCache}. TTL expiry
 * is driven deterministically by rewriting the stored timestamp via reflection instead of sleeping.
 */
@DisplayName("JobOwnershipCache")
class JobOwnershipCacheTest {

    private JobOwnershipCache cache;

    @BeforeEach
    void setUp() {
        cache = new JobOwnershipCache();
    }

    private static JobStoreEntry entry(String jobId) {
        return new JobStoreEntry(
                jobId,
                JobState.COMPLETE,
                "node-1",
                Instant.now(),
                Instant.now(),
                null,
                List.of("file-1"),
                Map.of());
    }

    @SuppressWarnings("unchecked")
    private ConcurrentMap<String, Object> internalEntries() throws Exception {
        Field f = JobOwnershipCache.class.getDeclaredField("entries");
        f.setAccessible(true);
        return (ConcurrentMap<String, Object>) f.get(cache);
    }

    /** Replaces the stored Entry's timestamp so the next get() observes a TTL expiry. */
    private void ageEntry(String jobId) throws Exception {
        ConcurrentMap<String, Object> entries = internalEntries();
        Object stored = entries.get(jobId);
        Field valueField = stored.getClass().getDeclaredField("value");
        valueField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Optional<JobStoreEntry> value = (Optional<JobStoreEntry>) valueField.get(stored);

        Constructor<?> ctor = stored.getClass().getDeclaredConstructor(Optional.class, long.class);
        ctor.setAccessible(true);
        // Timestamp far enough in the past to exceed the 5s TTL.
        long ancient = System.nanoTime() - 10L * 1_000_000_000L;
        entries.put(jobId, ctor.newInstance(value, ancient));
    }

    @Nested
    @DisplayName("get")
    class Get {

        @Test
        @DisplayName("returns empty for a never-stored job id (cache miss)")
        void missReturnsEmpty() {
            assertThat(cache.get("absent")).isEmpty();
        }

        @Test
        @DisplayName("returns the stored present value on a hit")
        void hitReturnsStoredPresentValue() {
            JobStoreEntry value = entry("job-1");
            cache.put("job-1", Optional.of(value));

            Optional<Optional<JobStoreEntry>> result = cache.get("job-1");

            assertThat(result).isPresent();
            assertThat(result.get()).contains(value);
        }

        @Test
        @DisplayName("returns a cached negative (empty) lookup as a hit wrapping empty")
        void hitReturnsCachedNegative() {
            cache.put("missing-job", Optional.empty());

            Optional<Optional<JobStoreEntry>> result = cache.get("missing-job");

            // Outer present (cache hit), inner empty (the job genuinely does not exist).
            assertThat(result).isPresent();
            assertThat(result.get()).isEmpty();
        }

        @Test
        @DisplayName("evicts and returns empty once the entry has outlived its TTL")
        void expiredEntryIsEvicted() throws Exception {
            cache.put("job-ttl", Optional.of(entry("job-ttl")));
            assertThat(cache.get("job-ttl")).isPresent();

            ageEntry("job-ttl");

            // Past the TTL the stale entry is dropped and reported as a miss.
            assertThat(cache.get("job-ttl")).isEmpty();
            assertThat(internalEntries()).doesNotContainKey("job-ttl");
        }
    }

    @Nested
    @DisplayName("put")
    class Put {

        @Test
        @DisplayName("overwriting a job id replaces the cached value")
        void overwriteReplacesValue() {
            JobStoreEntry first = entry("job-x");
            JobStoreEntry second = entry("job-x");
            cache.put("job-x", Optional.of(first));
            cache.put("job-x", Optional.of(second));

            assertThat(cache.get("job-x").orElseThrow()).contains(second);
        }

        @Test
        @DisplayName("clears the map when the max-entries cap is reached, then stores the new key")
        void clearsWhenCapacityReached() throws Exception {
            // Fill beyond the 2048 cap so the next put triggers a best-effort clear.
            for (int i = 0; i < 2048; i++) {
                cache.put("job-" + i, Optional.of(entry("job-" + i)));
            }
            assertThat(internalEntries()).hasSize(2048);

            cache.put("overflow", Optional.of(entry("overflow")));

            // The cache cleared the full map and kept only the newest entry.
            assertThat(internalEntries()).hasSize(1);
            assertThat(cache.get("overflow")).isPresent();
        }
    }
}
