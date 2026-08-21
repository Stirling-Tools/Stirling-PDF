package stirling.software.proprietary.policy.ledger;

/** Lifecycle of one {@code (policy, file)} ledger row. */
public enum ProcessedFileStatus {

    /** Claimed; a run is in flight. */
    PROCESSING,

    /** Run completed at this version. */
    DONE,

    /** Run failed; skipped until the file changes (clear-history is the manual retry). */
    ERROR,

    /** Was PROCESSING when the JVM died; retried a bounded number of times. */
    INTERRUPTED
}
