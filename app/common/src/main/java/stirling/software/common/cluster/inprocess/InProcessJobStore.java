package stirling.software.common.cluster.inprocess;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.JobStore;
import stirling.software.common.cluster.JobStoreEntry;

@Slf4j
public class InProcessJobStore implements JobStore {

    private final ConcurrentHashMap<String, Holder> entries = new ConcurrentHashMap<>();

    @Override
    public void put(JobStoreEntry entry, Duration ttl) {
        Instant expiry = ttl == null ? Instant.MAX : Instant.now().plus(ttl);
        entries.put(entry.jobId(), new Holder(entry, expiry));
    }

    @Override
    public Optional<JobStoreEntry> get(String jobId) {
        Holder h = entries.get(jobId);
        if (h == null) {
            return Optional.empty();
        }
        if (h.isExpired()) {
            entries.remove(jobId, h);
            return Optional.empty();
        }
        return Optional.of(h.entry);
    }

    @Override
    public void delete(String jobId) {
        entries.remove(jobId);
    }

    @Override
    public boolean exists(String jobId) {
        return get(jobId).isPresent();
    }

    @Override
    public Optional<String> findJobIdByFileId(String fileId) {
        for (Map.Entry<String, Holder> e : entries.entrySet()) {
            Holder h = e.getValue();
            if (h.isExpired()) {
                continue;
            }
            List<String> fileIds = h.entry.fileIds();
            if (fileIds != null && fileIds.contains(fileId)) {
                return Optional.of(e.getKey());
            }
        }
        return Optional.empty();
    }

    @Override
    public Collection<JobStoreEntry> all() {
        List<JobStoreEntry> result = new ArrayList<>(entries.size());
        for (Holder h : entries.values()) {
            if (!h.isExpired()) {
                result.add(h.entry);
            }
        }
        return result;
    }

    /** Drop entries whose TTL has elapsed. Called by the {@code TaskManager} cleanup scheduler. */
    public int purgeExpired() {
        int removed = 0;
        Instant now = Instant.now();
        for (Map.Entry<String, Holder> e : entries.entrySet()) {
            if (!e.getValue().expiry.equals(Instant.MAX) && e.getValue().expiry.isBefore(now)) {
                if (entries.remove(e.getKey(), e.getValue())) {
                    removed++;
                }
            }
        }
        return removed;
    }

    private record Holder(JobStoreEntry entry, Instant expiry) {
        boolean isExpired() {
            return !expiry.equals(Instant.MAX) && expiry.isBefore(Instant.now());
        }
    }
}
