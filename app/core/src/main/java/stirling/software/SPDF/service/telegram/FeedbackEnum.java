package stirling.software.SPDF.service.telegram;

/**
 * Enumeration representing different feedback types for Telegram service.
 *
 * @since 2.2.x
 */
public enum FeedbackEnum {
    /** Indicates that the provided document is not valid. */
    NOVALIDDOCUMENT,

    /** Indicates that an error occurred during processing. */
    PROCESSINGERROR,

    /** Represents a generic error message. */
    ERRORMESSAGE,

    /** Indicates that processing is ongoing. */
    PROCESSING
}
