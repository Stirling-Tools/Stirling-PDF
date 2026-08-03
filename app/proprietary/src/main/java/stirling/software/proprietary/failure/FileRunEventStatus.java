package stirling.software.proprietary.failure;

/**
 * Disposition of one recorded failure. {@code RESOLVED} is declared but not set yet (it becomes
 * system-set later); the rollup already defines what a repeat means for it, which is to reopen.
 */
public enum FileRunEventStatus {
    NEW,
    ACKNOWLEDGED,
    DISMISSED,
    RESOLVED;

    /** Whether no further transition is possible: the row is closed. */
    public boolean terminal() {
        return this == DISMISSED || this == RESOLVED;
    }
}
