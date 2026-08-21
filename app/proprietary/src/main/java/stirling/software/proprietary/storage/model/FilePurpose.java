package stirling.software.proprietary.storage.model;

/**
 * Defines the purpose classification for stored files. Used to categorize files based on their role
 * in the system.
 */
public enum FilePurpose {
    /** Regular file sharing - generic uploaded files */
    GENERIC,

    /** Original PDF in a signing session - the document to be signed */
    SIGNING_ORIGINAL,

    /** Final signed PDF - the completed document with all signatures applied */
    SIGNING_SIGNED,

    /** Audit trail for signing session - history and metadata */
    SIGNING_HISTORY
}
