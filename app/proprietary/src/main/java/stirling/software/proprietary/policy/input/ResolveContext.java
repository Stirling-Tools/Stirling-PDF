package stirling.software.proprietary.policy.input;

import java.util.Collection;
import java.util.function.Supplier;

/**
 * A source's policy-scoped window onto the processed-file ledger for one sweep. Thread-safe and
 * valid for the lifetime of the work units the source issued ({@link #settle} fires from async run
 * completions).
 */
public interface ResolveContext {

    /**
     * Atomically claim a file at its current version; true means this sweep runs it. A null {@code
     * contentHash} makes any gate change a new version; a non-null supplier is invoked at most
     * once, only on a gate mismatch, and a matching hash refreshes the stored gate instead of
     * reprocessing. Supplier exceptions propagate.
     */
    boolean claim(String identity, String gate, Supplier<String> contentHash);

    /** Record a claimed file's outcome at its final version ({@code finalContentHash} nullable). */
    void settle(String identity, String finalGate, String finalContentHash, boolean success);

    /**
     * Whether every policy holding a ledger row for this identity has settled it DONE. Cross-policy
     * by design: consume-mode deletion is a consensus of all claimants, so a shared input is
     * removed only once nobody still needs it (in-flight, failed, and interrupted rows all veto).
     */
    boolean allSettledDone(String identity);

    /**
     * Report every identity present right now, readable or not; feeds presence cleanup of rows
     * whose file is gone.
     */
    void reportPresent(Collection<String> identities);
}
