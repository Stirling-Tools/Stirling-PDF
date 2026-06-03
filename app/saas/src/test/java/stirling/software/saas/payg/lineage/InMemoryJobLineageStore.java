package stirling.software.saas.payg.lineage;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import stirling.software.saas.payg.model.ArtifactKind;
import stirling.software.saas.payg.model.JobStatus;

/**
 * In-memory test double for {@link JobLineageStore}. Same interface as the JPA store, plus a {@link
 * #registerJob} hook so tests can model "this job exists with this user/status/lastStepAt" without
 * standing up a database.
 *
 * <p>The store keeps two maps: one of recorded hash entries, one of registered job state. The
 * findOpenJobForSignatures impl joins them in-process the same way the JPA query does at the DB.
 *
 * <p>Lives in {@code src/test} because it's only useful for unit testing the detector. A future
 * Redis-backed production impl would live in {@code src/main} alongside {@link JpaJobLineageStore}.
 */
public class InMemoryJobLineageStore implements JobLineageStore {

    // All access is synchronized on `this` — a plain HashMap is fine here; ConcurrentHashMap
    // would duplicate the locking the synchronized methods already provide.
    private final List<Entry> entries = new ArrayList<>();
    private final Map<UUID, JobState> jobs = new HashMap<>();

    public synchronized void registerJob(
            UUID jobId, Long ownerUserId, JobStatus status, LocalDateTime lastStepAt) {
        jobs.put(jobId, new JobState(ownerUserId, status, lastStepAt));
    }

    @Override
    public synchronized void record(
            UUID jobId, Set<LineageSignature> signatures, ArtifactKind kind) {
        Instant now = Instant.now();
        for (LineageSignature sig : signatures) {
            entries.add(new Entry(jobId, sig.asStorageKey(), kind, now));
        }
    }

    @Override
    public synchronized Optional<LineageMatch> findOpenJobForSignatures(
            Long userId, Set<LineageSignature> candidates, Duration workflowWindow) {
        LocalDateTime since = LocalDateTime.now().minus(workflowWindow);
        Set<String> candidateKeys =
                candidates.stream()
                        .map(LineageSignature::asStorageKey)
                        .collect(java.util.stream.Collectors.toSet());

        return entries.stream()
                .filter(e -> candidateKeys.contains(e.storageKey()))
                .map(
                        e -> {
                            JobState job = jobs.get(e.jobId());
                            if (job == null) return null;
                            if (!userId.equals(job.ownerUserId())) return null;
                            if (job.status() != JobStatus.OPEN) return null;
                            if (!job.lastStepAt().isAfter(since)) return null;
                            return new LineageMatch(e.jobId(), e.kind(), job.lastStepAt());
                        })
                .filter(java.util.Objects::nonNull)
                .max(Comparator.comparing(LineageMatch::jobLastStepAt));
    }

    @Override
    public synchronized int pruneOlderThan(Instant cutoff) {
        int before = entries.size();
        entries.removeIf(e -> e.recordedAt().isBefore(cutoff));
        return before - entries.size();
    }

    /** Test helper — clears all state. */
    public synchronized void clear() {
        entries.clear();
        jobs.clear();
    }

    private record Entry(UUID jobId, String storageKey, ArtifactKind kind, Instant recordedAt) {}

    private record JobState(Long ownerUserId, JobStatus status, LocalDateTime lastStepAt) {}
}
