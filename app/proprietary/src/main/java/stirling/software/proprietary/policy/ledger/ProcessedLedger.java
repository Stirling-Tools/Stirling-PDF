package stirling.software.proprietary.policy.ledger;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Remembers which files a policy has processed, one row per {@code (policy, identity)}, so sources
 * track files in place. Identities are opaque source-owned strings; versions are two-tier: a cheap
 * gate compared every sweep plus an optional content hash consulted only when the gate moves.
 * Presence reconciliation ({@link #markSeen} + {@link #deleteUnseen}) keeps the table bounded.
 */
public interface ProcessedLedger {

    /**
     * Claims of one version before an {@link ProcessedFileStatus#INTERRUPTED} row stops retrying.
     */
    int MAX_ATTEMPTS = 3;

    /**
     * One-query snapshot of the rows for these identities, keyed by identity; identities with no
     * row are absent. Feeds the {@code observed} parameter of {@link #claim(String, String, String,
     * Supplier, ClaimState)} so a sweep decides its claims without a per-file lookup.
     */
    Map<String, ClaimState> statesFor(String policyId, Collection<String> identities);

    /**
     * Atomically claim a file at its current version, deciding against {@code observed} (this row's
     * entry from {@link #statesFor}; null means no row was seen); true means this caller runs it. A
     * stale {@code observed} cannot double-claim - every transition re-checks the observed state,
     * so a lost race skips until a later sweep. A null {@code contentHash} makes any gate change a
     * new version; a non-null supplier is invoked at most once, only on a gate mismatch, and a
     * matching hash refreshes the stored gate instead of reprocessing. Supplier exceptions
     * propagate.
     */
    boolean claim(
            String policyId,
            String identity,
            String gate,
            Supplier<String> contentHash,
            ClaimState observed);

    /** Snapshot-then-claim convenience for a single file; sweeps batch via {@link #statesFor}. */
    default boolean claim(
            String policyId, String identity, String gate, Supplier<String> contentHash) {
        return claim(
                policyId,
                identity,
                gate,
                contentHash,
                statesFor(policyId, List.of(identity)).get(identity));
    }

    /** Record a claimed file's outcome at its final version ({@code finalContentHash} nullable). */
    void settle(
            String policyId,
            String identity,
            String finalGate,
            String finalContentHash,
            boolean success);

    /**
     * Record a produced file as {@link ProcessedFileStatus#DONE} so the policy skips its own
     * outputs. Must be called before the file is visible at this identity; other policies have no
     * row and still process it.
     */
    void recordOutput(String policyId, String identity, String gate, String contentHash);

    /**
     * Remove an output record whose file never became visible (its rename lost the name race to a
     * concurrent writer), so whatever file actually owns that identity is claimable at any version.
     * A no-op unless the row is still settled exactly as recorded, so a claim that took the row
     * over in the meantime is left alone.
     */
    void forgetOutput(String policyId, String identity, String gate);

    /**
     * Whether every row at this identity - across all policies, by design - is {@link
     * ProcessedFileStatus#DONE}. Consume-mode deletion gates on this so a shared input is removed
     * only once every claimant has processed it; in-flight, failed, and interrupted rows all veto,
     * parking the file. Vacuously true when no rows exist.
     */
    boolean allSettledDone(String identity);

    /** Stamp presence for every identity a full-listing sweep observed. */
    void markSeen(String policyId, Collection<String> identities);

    /**
     * Remove rows not seen since {@code seenSinceMillis}, keeping in-flight claims. Only call after
     * every enabled source listed completely; returns the number of rows removed.
     */
    int deleteUnseen(String policyId, long seenSinceMillis);

    /** Forget everything for a policy. */
    void clearPolicy(String policyId);

    /** Boot recovery: flip stale in-flight claims to {@link ProcessedFileStatus#INTERRUPTED}. */
    void recoverInterrupted();
}
