package stirling.software.proprietary.policy.ledger;

/** Lifecycle of one {@code (policy, file)} ledger row. */
public enum ProcessedFileStatus {

    /** Claimed by a sweep; a run is in flight. Only a settle or boot recovery moves it on. */
    PROCESSING,

    /** Run completed; the signature is the version the policy finished at. */
    DONE,

    /**
     * Run failed; skipped until the file's signature changes (parity with the old {@code error/}
     * folder). Clearing the policy's history is the manual retry.
     */
    ERROR,

    /**
     * Was {@code PROCESSING} when the JVM died; set only by boot recovery. Re-claimed with a
     * bounded number of attempts so a reboot victim reprocesses but a file that reliably kills the
     * JVM cannot crash-loop it.
     */
    INTERRUPTED
}
