package stirling.software.proprietary.policy.input;

import java.util.Collection;

/**
 * A source's window onto the processed-file ledger for one policy sweep. The runner constructs it
 * scoped to the policy, so sources deal only in their own opaque identities (folder: canonical
 * absolute path) and signatures (folder: {@code size:mtime} or content hash) - a new source kind
 * needs nothing more than these three calls. Thread-safe, and valid for the lifetime of the work
 * units the source issued ({@link #settle} fires from async run completions).
 */
public interface ResolveContext {

    /**
     * Atomically claim a file at its current signature. True means this sweep runs it; false means
     * another sweep has it in flight, the policy already settled this version, or the claim was
     * lost to a race - skip it either way.
     */
    boolean claim(String identity, String signature);

    /**
     * Record a claimed file's outcome at its final signature (re-stat after the run so an in-place
     * overwrite settles at the version that was produced).
     */
    void settle(String identity, String finalSignature, boolean success);

    /**
     * Report every identity present in the source right now, readable or not (readiness only gates
     * claiming). On a full-listing sweep this feeds presence cleanup: rows whose file is gone from
     * all of the policy's sources are removed, which is what keeps the ledger bounded.
     */
    void reportPresent(Collection<String> identities);
}
