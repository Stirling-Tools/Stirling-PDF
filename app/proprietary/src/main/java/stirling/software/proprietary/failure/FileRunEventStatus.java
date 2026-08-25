package stirling.software.proprietary.failure;

import java.util.Arrays;
import java.util.List;

/**
 * Disposition of one recorded failure. {@code RESOLVED} is system-set when a client reports its own
 * retry worked, never dispatched as an action; a repeat reopens it.
 */
public enum FileRunEventStatus {
    NEW(false),
    ACKNOWLEDGED(false),
    DISMISSED(true),
    RESOLVED(true),

    /**
     * The document this incident was about was deleted from its owner's editor, so there is nothing
     * left to act on. Distinct from {@code DISMISSED}, which is a reviewer's decision, and from
     * {@code RESOLVED}, which reopens on recurrence: this one cannot recur, the file is gone.
     */
    FILE_REMOVED(true);

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
