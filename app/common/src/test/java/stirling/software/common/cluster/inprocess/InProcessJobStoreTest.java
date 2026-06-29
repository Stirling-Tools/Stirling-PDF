package stirling.software.common.cluster.inprocess;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import stirling.software.common.cluster.JobStoreEntry;

class InProcessJobStoreTest {

    private final InProcessJobStore store = new InProcessJobStore();

    @Test
    void putGetDeleteExistsRoundTrip() {
        JobStoreEntry entry = entry("job-1");
        store.put(entry, Duration.ofMinutes(30));

        assertTrue(store.exists("job-1"));
        assertEquals(entry, store.get("job-1").orElseThrow());

        store.delete("job-1");
        assertFalse(store.exists("job-1"));
    }

    @Test
    void ttlExpiry() throws InterruptedException {
        store.put(entry("job-2"), Duration.ofMillis(50));
        Thread.sleep(100);
        assertFalse(store.get("job-2").isPresent());
    }

    @Test
    void purgeExpiredRemovesOnlyStaleEntries() throws InterruptedException {
        store.put(entry("job-fresh"), Duration.ofMinutes(30));
        store.put(entry("job-stale"), Duration.ofMillis(20));
        Thread.sleep(80);

        int removed = store.purgeExpired();
        assertEquals(1, removed);
        assertTrue(store.exists("job-fresh"));
    }

    @Test
    void findJobIdByFileIdReturnsTheRightJob() {
        store.put(
                new JobStoreEntry(
                        "job-a",
                        JobStoreEntry.JobState.COMPLETE,
                        "node-1",
                        Instant.now(),
                        Instant.now(),
                        null,
                        List.of("file-1", "file-2"),
                        Map.of()),
                Duration.ofMinutes(30));
        store.put(
                new JobStoreEntry(
                        "job-b",
                        JobStoreEntry.JobState.COMPLETE,
                        "node-1",
                        Instant.now(),
                        Instant.now(),
                        null,
                        List.of("file-3"),
                        Map.of()),
                Duration.ofMinutes(30));

        assertEquals("job-a", store.findJobIdByFileId("file-1").orElseThrow());
        assertEquals("job-b", store.findJobIdByFileId("file-3").orElseThrow());
        assertFalse(store.findJobIdByFileId("missing").isPresent());
    }

    private JobStoreEntry entry(String id) {
        return new JobStoreEntry(
                id,
                JobStoreEntry.JobState.PENDING,
                "node-1",
                Instant.now(),
                null,
                null,
                List.of(),
                Map.of());
    }
}
