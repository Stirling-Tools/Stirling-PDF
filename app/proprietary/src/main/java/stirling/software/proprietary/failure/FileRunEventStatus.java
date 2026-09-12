package stirling.software.proprietary.failure;

import java.util.Arrays;
import java.util.List;

/** Disposition of one recorded failure. {@code RESOLVED} is system-set; a repeat reopens it. */
public enum FileRunEventStatus {
    NEW(false),
    ACKNOWLEDGED(false),
    DISMISSED(true),
    RESOLVED(true),

    /**
     * The document was deleted, so there is nothing left to act on. A recurrence reopens it like
     * {@code RESOLVED}: a fresh failure is proof the document is back.
     */
    FILE_REMOVED(true);

    /** The statuses a review queue shows by default: everything still needing a decision. */
    private static final List<FileRunEventStatus> OPEN =
            Arrays.stream(values()).filter(status -> !status.terminal).toList();

    /** The settled rest, kept so a reviewer can see how a past failure was disposed of. */
    private static final List<FileRunEventStatus> CLOSED =
            Arrays.stream(values()).filter(status -> status.terminal).toList();

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

    public static List<FileRunEventStatus> closed() {
        return CLOSED;
    }
}
