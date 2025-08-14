package stirling.software.proprietary.model;

/** Classification of API call failures for credit charging purposes */
public enum FailureType {
    /**
     * Client-side errors that don't consume credits and don't count toward failure limit Examples:
     * 400 Bad Request, 401 Unauthorized, 403 Forbidden, 422 Unprocessable Entity
     */
    CLIENT_ERROR,

    /**
     * Processing errors that occur after validation passes - these count toward consecutive
     * failures Examples: 500 Internal Server Error, processing exceptions, timeout during PDF
     * manipulation
     */
    PROCESSING_ERROR,

    /** Successful processing - resets failure counter and consumes credits */
    SUCCESS
}
