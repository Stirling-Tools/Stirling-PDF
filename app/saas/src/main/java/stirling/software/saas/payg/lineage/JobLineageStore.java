package stirling.software.saas.payg.lineage;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import stirling.software.saas.payg.model.ArtifactKind;

/**
 * Persistence boundary for lineage data. Two operations: record signatures against a job, and look
 * up the open job (if any) that previously recorded a matching signature for the same user.
 *
 * <p>This interface deliberately knows nothing about the storage technology — the production impl
 * is JPA-backed against {@code job_artifact_hash}, and a future Redis-backed impl will be a
 * straight swap. The detector and any callers only see this interface.
 *
 * <p>Signature values are stored using {@link LineageSignature#asStorageKey()}, so multiple
 * signature types (SHA-256, PDF {@code /ID}, etc.) coexist on the same table without a separate
 * column.
 */
public interface JobLineageStore {

    /** Records every signature in {@code signatures} against the given job + artifact kind. */
    void record(UUID jobId, Set<LineageSignature> signatures, ArtifactKind kind);

    /**
     * Finds the most-recently-active open job (owned by {@code userId}, whose {@code last_step_at}
     * is within {@code workflowWindow}) whose recorded artifacts include any of the supplied
     * candidate signatures. Returns the first match; ordering across multiple matches is by job
     * activity recency.
     */
    Optional<LineageMatch> findOpenJobForSignatures(
            Long userId, Set<LineageSignature> candidates, Duration workflowWindow);

    /** Deletes records created before {@code cutoff}. Returns the number of rows removed. */
    int pruneOlderThan(Instant cutoff);
}
