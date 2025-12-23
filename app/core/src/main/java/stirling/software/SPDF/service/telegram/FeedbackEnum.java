package stirling.software.SPDF.service.telegram;

/**
 * Enumeration representing different feedback types for Telegram service.
 *
 * @since 2.2.x
 */
public enum FeedbackEnum {
    /** Indicates that the provided document is not valid. */
    NO_VALID_DOCUMENT,

    /** Represents a generic error message. */
    ERROR_MESSAGE,

    /** Indicates that an error occurred during processing. */
    ERROR_PROCESSING,

    /** Indicates that processing is ongoing. */
    PROCESSING
}
