package stirling.software.saas.model;

public enum ProcessingErrorType {

    /**
     * Validation errors. should never cost credits. Examples: missing parameters, invalid file
     * types, size limits exceeded, malformed requests, authentication failures
     */
    VALIDATION_ERROR,

    /**
     * Processing errors. should cost credits after 3rd attempt per user/endpoint. Examples: corrupt
     * PDF files, unsupported PDF features, memory issues during processing, OCR failures on valid
     * PDFs, conversion errors on valid files
     */
    PROCESSING_ERROR,

    /**
     * System errors. should not cost credits (our fault). Examples: database connection issues,
     * filesystem problems, service unavailable, internal server errors
     */
    SYSTEM_ERROR;

    /** Determine error type from exception and HTTP status */
    public static ProcessingErrorType classifyError(
            Throwable throwable, int httpStatus, String endpoint) {
        if (throwable == null) {
            return classifyByHttpStatus(httpStatus);
        }

        String errorMessage = throwable.getMessage();
        String exceptionClass = throwable.getClass().getSimpleName();

        // Validation errors (client-side issues)
        if (httpStatus == 400 || httpStatus == 422) {
            if (isValidationError(errorMessage, exceptionClass)) {
                return VALIDATION_ERROR;
            }
        }

        // Authentication/Authorization errors
        if (httpStatus == 401 || httpStatus == 403) {
            return VALIDATION_ERROR;
        }

        // Rate limiting
        if (httpStatus == 429) {
            return VALIDATION_ERROR;
        }

        // System errors (our fault)
        if (httpStatus >= 500 || isSystemError(errorMessage, exceptionClass)) {
            return SYSTEM_ERROR;
        }

        // Processing errors (user's data issue but valid request)
        if (isProcessingError(errorMessage, exceptionClass, endpoint)) {
            return PROCESSING_ERROR;
        }

        // Default to validation error to be safe
        return VALIDATION_ERROR;
    }

    private static ProcessingErrorType classifyByHttpStatus(int httpStatus) {
        if (httpStatus >= 400 && httpStatus < 500) {
            return VALIDATION_ERROR;
        } else if (httpStatus >= 500) {
            return SYSTEM_ERROR;
        }
        return VALIDATION_ERROR;
    }

    private static boolean isValidationError(String errorMessage, String exceptionClass) {
        if (errorMessage == null && exceptionClass == null) return false;

        String[] validationKeywords = {
            "validation", "invalid parameter", "missing parameter", "malformed",
            "bad request", "illegal argument", "file too large", "unsupported file type",
            "empty file", "no file provided", "invalid format"
        };

        String[] validationExceptions = {
            "IllegalArgumentException",
            "ValidationException",
            "BindException",
            "MethodArgumentNotValidException",
            "MissingServletRequestParameterException",
            "HttpMessageNotReadableException",
            "MaxUploadSizeExceededException"
        };

        return containsAny(errorMessage, validationKeywords)
                || containsAny(exceptionClass, validationExceptions);
    }

    private static boolean isSystemError(String errorMessage, String exceptionClass) {
        if (errorMessage == null && exceptionClass == null) return false;

        String[] systemExceptions = {
            "SQLException",
            "IOException",
            "OutOfMemoryError",
            "TimeoutException",
            "ConnectException",
            "UnknownHostException",
            "ServiceUnavailableException"
        };

        return containsAny(exceptionClass, systemExceptions);
    }

    private static boolean isProcessingError(
            String errorMessage, String exceptionClass, String endpoint) {
        if (errorMessage == null && exceptionClass == null) return false;

        String[] processingExceptions = {
            "PDFException", "COSVisitorException", "InvalidPDFException",
            "ConversionException", "OCRException", "ParseException"
        };

        // If we're checking errors for an endpoint, it's already been identified as a tracked
        // endpoint
        // through @AutoJobPostMapping annotation, so we can assume it's a PDF processing endpoint
        return containsAny(exceptionClass, processingExceptions)
                || (endpoint != null && !isValidationError(errorMessage, exceptionClass));
    }

    private static boolean containsAny(String text, String[] keywords) {
        if (text == null) return false;
        String lowerText = text.toLowerCase();
        for (String keyword : keywords) {
            if (lowerText.contains(keyword.toLowerCase())) {
                return true;
            }
        }
        return false;
    }
}
