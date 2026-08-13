package stirling.software.proprietary.failure;

/**
 * Whose incident this is, from the point of view of whoever is reading it. Derived on read and
 * never persisted: the same row is {@code MINE} to the member who hit it and {@code THEIRS} to the
 * leader reviewing after them, so a stored answer would be wrong for everyone but one person.
 */
public enum Ownership {

    /** The caller's own failure: their work, and their client holding the document. */
    MINE,

    /** A colleague's, visible because the caller reviews the team. */
    THEIRS,

    /**
     * Nobody's. An unattended run failed, with a folder, bucket or webhook as its only attribution,
     * so there is no owner to hand the resolution to.
     */
    UNOWNED
}
