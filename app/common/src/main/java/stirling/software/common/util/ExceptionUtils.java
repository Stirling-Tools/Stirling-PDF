package stirling.software.common.util;

import java.io.IOException;
import java.text.MessageFormat;

import lombok.extern.slf4j.Slf4j;

/**
 * Utility class for handling exceptions with internationalized error messages. Provides consistent
 * error handling and user-friendly messages across the application.
 */
@Slf4j
public class ExceptionUtils {

    /**
     * Create an IOException with internationalized message for PDF corruption.
     *
     * @param cause the original exception
     * @return IOException with user-friendly message
     */
    public static IOException createPdfCorruptedException(Exception cause) {
        return createPdfCorruptedException(null, cause);
    }

    /**
     * Create an IOException with internationalized message for PDF corruption with context.
     *
     * @param context additional context (e.g., "during merge", "during image extraction")
     * @param cause the original exception
     * @return IOException with user-friendly message
     */
    public static IOException createPdfCorruptedException(String context, Exception cause) {
        String message;
        if (context != null && !context.isEmpty()) {
            message =
                    String.format(
                            "Error %s: PDF file appears to be corrupted or damaged. Please try using the 'Repair PDF' feature first to fix the file before proceeding with this operation.",
                            context);
        } else {
            message =
                    "PDF file appears to be corrupted or damaged. Please try using the 'Repair PDF' feature first to fix the file before proceeding with this operation.";
        }
        return new IOException(message, cause);
    }

    /**
     * Create an IOException with internationalized message for multiple corrupted PDFs.
     *
     * @param cause the original exception
     * @return IOException with user-friendly message
     */
    public static IOException createMultiplePdfCorruptedException(Exception cause) {
        String message =
                "One or more PDF files appear to be corrupted or damaged. Please try using the 'Repair PDF' feature on each file first before attempting to merge them.";
        return new IOException(message, cause);
    }

    /**
     * Create an IOException with internationalized message for PDF encryption issues.
     *
     * @param cause the original exception
     * @return IOException with user-friendly message
     */
    public static IOException createPdfEncryptionException(Exception cause) {
        String message =
                "The PDF appears to have corrupted encryption data. This can happen when the PDF was created with incompatible encryption methods. Please try using the 'Repair PDF' feature first, or contact the document creator for a new copy.";
        return new IOException(message, cause);
    }

    /**
     * Create an IOException with internationalized message for PDF password issues.
     *
     * @param cause the original exception
     * @return IOException with user-friendly message
     */
    public static IOException createPdfPasswordException(Exception cause) {
        String message =
                "The PDF Document is passworded and either the password was not provided or was incorrect";
        return new IOException(message, cause);
    }

    /**
     * Create an IOException with internationalized message for file processing errors.
     *
     * @param operation the operation being performed (e.g., "merge", "split", "convert")
     * @param cause the original exception
     * @return IOException with user-friendly message
     */
    public static IOException createFileProcessingException(String operation, Exception cause) {
        String message =
                String.format(
                        "An error occurred while processing the file during %s operation: %s",
                        operation, cause.getMessage());
        return new IOException(message, cause);
    }

    /**
     * Create a generic IOException with internationalized message.
     *
     * @param messageKey the i18n message key
     * @param defaultMessage the default message if i18n is not available
     * @param cause the original exception
     * @param args optional arguments for the message
     * @return IOException with user-friendly message
     */
    public static IOException createIOException(
            String messageKey, String defaultMessage, Exception cause, Object... args) {
        String message = MessageFormat.format(defaultMessage, args);
        return new IOException(message, cause);
    }

    /**
     * Create a generic RuntimeException with internationalized message.
     *
     * @param messageKey the i18n message key
     * @param defaultMessage the default message if i18n is not available
     * @param cause the original exception
     * @param args optional arguments for the message
     * @return RuntimeException with user-friendly message
     */
    public static RuntimeException createRuntimeException(
            String messageKey, String defaultMessage, Exception cause, Object... args) {
        String message = MessageFormat.format(defaultMessage, args);
        return new RuntimeException(message, cause);
    }

    /**
     * Create an IllegalArgumentException with internationalized message.
     *
     * @param messageKey the i18n message key
     * @param defaultMessage the default message if i18n is not available
     * @param args optional arguments for the message
     * @return IllegalArgumentException with user-friendly message
     */
    public static IllegalArgumentException createIllegalArgumentException(
            String messageKey, String defaultMessage, Object... args) {
        String message = MessageFormat.format(defaultMessage, args);
        return new IllegalArgumentException(message);
    }

    /** Create file validation exceptions. */
    public static IllegalArgumentException createHtmlFileRequiredException() {
        return createIllegalArgumentException(
                "error.fileFormatRequired", "File must be in {0} format", "HTML or ZIP");
    }

    public static IllegalArgumentException createPdfFileRequiredException() {
        return createIllegalArgumentException(
                "error.fileFormatRequired", "File must be in {0} format", "PDF");
    }

    public static IllegalArgumentException createInvalidPageSizeException(String size) {
        return createIllegalArgumentException(
                "error.invalidFormat", "Invalid {0} format: {1}", "page size", size);
    }

    /** Create OCR-related exceptions. */
    public static IOException createOcrLanguageRequiredException() {
        return createIOException(
                "error.optionsNotSpecified", "{0} options are not specified", null, "OCR language");
    }

    public static IOException createOcrInvalidLanguagesException() {
        return createIOException(
                "error.invalidFormat",
                "Invalid {0} format: {1}",
                null,
                "OCR languages",
                "none of the selected languages are valid");
    }

    public static IOException createOcrToolsUnavailableException() {
        return createIOException(
                "error.toolNotInstalled", "{0} is not installed", null, "OCR tools");
    }

    /** Create system requirement exceptions. */
    public static IOException createPythonRequiredForWebpException() {
        return createIOException(
                "error.toolRequired", "{0} is required for {1}", null, "Python", "WebP conversion");
    }

    /** Create file operation exceptions. */
    public static IOException createFileNotFoundException(String fileId) {
        return createIOException("error.fileNotFound", "File not found with ID: {0}", null, fileId);
    }

    public static RuntimeException createPdfaConversionFailedException() {
        return createRuntimeException(
                "error.conversionFailed", "{0} conversion failed", null, "PDF/A");
    }

    public static IllegalArgumentException createInvalidComparatorException() {
        return createIllegalArgumentException(
                "error.invalidFormat",
                "Invalid {0} format: {1}",
                "comparator",
                "only 'greater', 'equal', and 'less' are supported");
    }

    /** Create compression-related exceptions. */
    public static RuntimeException createMd5AlgorithmException(Exception cause) {
        return createRuntimeException(
                "error.algorithmNotAvailable", "{0} algorithm not available", cause, "MD5");
    }

    public static IllegalArgumentException createCompressionOptionsException() {
        return createIllegalArgumentException(
                "error.optionsNotSpecified",
                "{0} options are not specified",
                "compression (expected output size and optimize level)");
    }

    public static IOException createGhostscriptCompressionException() {
        return createIOException(
                "error.commandFailed", "{0} command failed", null, "Ghostscript compression");
    }

    public static IOException createGhostscriptCompressionException(Exception cause) {
        return createIOException(
                "error.commandFailed", "{0} command failed", cause, "Ghostscript compression");
    }

    public static IOException createQpdfCompressionException(Exception cause) {
        return createIOException("error.commandFailed", "{0} command failed", cause, "QPDF");
    }

    /**
     * Check if an exception indicates a corrupted PDF and wrap it with appropriate message.
     *
     * @param e the exception to check
     * @return the original exception if not PDF corruption, or a new IOException with user-friendly
     *     message
     */
    public static IOException handlePdfException(IOException e) {
        return handlePdfException(e, null);
    }

    /**
     * Check if an exception indicates a corrupted PDF and wrap it with appropriate message.
     *
     * @param e the exception to check
     * @param context additional context for the error
     * @return the original exception if not PDF corruption, or a new IOException with user-friendly
     *     message
     */
    public static IOException handlePdfException(IOException e, String context) {
        if (PdfErrorUtils.isCorruptedPdfError(e)) {
            return createPdfCorruptedException(context, e);
        }

        if (isEncryptionError(e)) {
            return createPdfEncryptionException(e);
        }

        if (isPasswordError(e)) {
            return createPdfPasswordException(e);
        }

        return e; // Return original exception if no specific handling needed
    }

    /**
     * Check if an exception indicates a PDF encryption/decryption error.
     *
     * @param e the exception to check
     * @return true if it's an encryption error, false otherwise
     */
    public static boolean isEncryptionError(IOException e) {
        String message = e.getMessage();
        if (message == null) return false;

        return message.contains("BadPaddingException")
                || message.contains("Given final block not properly padded")
                || message.contains("AES initialization vector not fully read")
                || message.contains("Failed to decrypt");
    }

    /**
     * Check if an exception indicates a PDF password error.
     *
     * @param e the exception to check
     * @return true if it's a password error, false otherwise
     */
    public static boolean isPasswordError(IOException e) {
        String message = e.getMessage();
        if (message == null) return false;

        return message.contains("password is incorrect")
                || message.contains("Password is not provided")
                || message.contains("PDF contains an encryption dictionary");
    }

    /**
     * Log an exception with appropriate level based on its type.
     *
     * @param operation the operation being performed
     * @param e the exception that occurred
     */
    public static void logException(String operation, Exception e) {
        if (PdfErrorUtils.isCorruptedPdfError(e)) {
            log.warn("PDF corruption detected during {}: {}", operation, e.getMessage());
        } else if (e instanceof IOException
                && (isEncryptionError((IOException) e) || isPasswordError((IOException) e))) {
            log.info("PDF security issue during {}: {}", operation, e.getMessage());
        } else {
            log.error("Unexpected error during {}", operation, e);
        }
    }

    /** Create common validation exceptions. */
    public static IllegalArgumentException createInvalidArgumentException(String argumentName) {
        return createIllegalArgumentException(
                "error.invalidArgument", "Invalid argument: {0}", argumentName);
    }

    public static IllegalArgumentException createInvalidArgumentException(
            String argumentName, String value) {
        return createIllegalArgumentException(
                "error.invalidFormat", "Invalid {0} format: {1}", argumentName, value);
    }

    public static IllegalArgumentException createNullArgumentException(String argumentName) {
        return createIllegalArgumentException(
                "error.argumentRequired", "{0} must not be null", argumentName);
    }
}
