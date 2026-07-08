package stirling.software.proprietary.policy.ledger;

import java.util.Collection;

/**
 * Remembers which files a policy has processed, one small row per {@code (policy, identity)}, so
 * watched folders are tracked in place instead of hoarding copies in a work directory. Identities
 * and signatures are opaque strings owned by the input source (folder: canonical absolute path and
 * {@code size:mtime} / content hash), so non-filesystem sources reuse the ledger unchanged.
 *
 * <p>Rows are scoped by policy, not source: several policies watching one folder each process a
 * file once, and a policy's overlapping (nested) sources dedupe against the same row. Growth is
 * bounded by presence reconciliation ({@link #markSeen} + {@link #deleteUnseen}) driven by the
 * caller's full-listing sweeps, so the ledger self-trims to roughly the files currently present.
 */
public interface ProcessedLedger {

    /**
     * Total claims of one signature before an {@link ProcessedFileStatus#INTERRUPTED} row stops
     * being retried, so a file whose run kills the JVM cannot crash-loop it.
     */
    int MAX_ATTEMPTS = 3;

    /**
     * Atomically claim a file at its current signature. True means this caller runs it; false means
     * it is already claimed, already settled at this signature, or lost the race. A settled row
     * with a different signature is re-claimed (the file changed).
     */
    boolean claim(String policyId, String identity, String signature);

    /**
     * Record the run's outcome at the file's final signature (re-stat after the run, so an in-place
     * overwrite settles at the version we produced). Re-inserts if the row was presence-cleaned
     * mid-run.
     */
    void settle(String policyId, String identity, String finalSignature, boolean success);

    /**
     * Record a file this policy just produced as {@link ProcessedFileStatus#DONE} so the policy
     * skips its own outputs. Must be called BEFORE the file becomes visible at this identity; other
     * policies deliberately have no such row and still process it (chaining).
     */
    void recordOutput(String policyId, String identity, String signature);

    /** Stamp presence for every identity a full-listing sweep observed. */
    void markSeen(String policyId, Collection<String> identities);

    /**
     * Presence cleanup after a full sweep: remove this policy's rows not seen since {@code
     * seenSinceMillis} (the sweep start), skipping in-flight claims. Only call when every enabled
     * source listed completely; returns the number of rows removed.
     */
    int deleteUnseen(String policyId, long seenSinceMillis);

    /** Forget everything for a policy: instant "reprocess from scratch" and delete-policy hook. */
    void clearPolicy(String policyId);

    /**
     * Boot recovery: flip in-flight claims from a previous JVM to {@link
     * ProcessedFileStatus#INTERRUPTED} so they are retried (bounded by {@link #MAX_ATTEMPTS}).
     */
    void recoverInterrupted();
}
