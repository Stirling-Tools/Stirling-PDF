package stirling.software.proprietary.failure;

import java.util.Arrays;
import java.util.List;

/**
 * Disposition of one recorded failure. {@code RESOLVED} is declared but not set yet (it becomes
 * system-set later); the rollup already defines what a repeat means for it, which is to reopen.
 */
public enum FileRunEventStatus {
    NEW(false),
    ACKNOWLEDGED(false),
    DISMISSED(true),
    RESOLVED(true);

    /** The statuses a review queue shows by default: everything still needing a decision. */
    private static final List<FileRunEventStatus> OPEN =
            Arrays.stream(values()).filter(status -> !status.terminal).toList();

    /** Whether no further transition is possible: the row is closed. */
    private final boolean terminal;

    FileRunEventStatus(boolean terminal) {
        this.terminal = terminal;
    }

    public boolean terminal() {
        return terminal;
    }

    public static List<FileRunEventStatus> open() {
        return OPEN;
    }
}
