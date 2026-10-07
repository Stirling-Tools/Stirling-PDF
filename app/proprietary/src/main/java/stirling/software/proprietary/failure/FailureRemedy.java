package stirling.software.proprietary.failure;

/**
 * What intervention would clear this failure. Advisory metadata for the review surface; nothing
 * branches on it server-side yet.
 */
public enum FailureRemedy {
    TRANSIENT,
    NEEDS_USER_INPUT,
    NEEDS_FILE_FIX,
    NEEDS_CONFIG_FIX,
    NEEDS_SERVER_FIX,
    PERMANENT
}
