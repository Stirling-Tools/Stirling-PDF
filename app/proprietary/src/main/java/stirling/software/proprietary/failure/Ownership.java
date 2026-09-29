package stirling.software.proprietary.failure;

/**
 * Whose incident this is, from the reader's point of view. Derived on read, never persisted: one
 * row is {@code MINE} to whoever hit it and {@code THEIRS} to the leader reviewing after them.
 */
public enum Ownership {
    MINE,

    /** A colleague's, visible because the caller reviews the team. */
    THEIRS,

    /**
     * An unattended run: a folder, bucket or webhook is its only attribution, so there is no owner.
     */
    UNOWNED
}
