package stirling.software.common.util;

import java.io.IOException;
import java.text.MessageFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.MissingResourceException;
import java.util.ResourceBundle;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

/**
 * Utility class for handling exceptions with internationalized error messages. Provides consistent
 * error handling and user-friendly messages across the application.
 *
 * <p>This class works in with {@code GlobalExceptionHandler} to provide a complete exception
 * handling solution:
 *
 * <h2>Integration Pattern:</h2>
 *
 * <ol>
 *   <li><strong>Exception Creation:</strong> Use ExceptionUtils factory methods (e.g., {@link
 *       #createPdfCorruptedException}) to create typed exceptions with error codes
 *   <li><strong>HTTP Response:</strong> GlobalExceptionHandler catches these exceptions and
 *       converts them to RFC 7807 Problem Details responses
 *   <li><strong>Internationalization:</strong> Both use shared ResourceBundle (messages.properties)
 *       for consistent localized messages
 *   <li><strong>Error Codes:</strong> {@link ErrorCode} enum provides structured error tracking
 * </ol>
 *
 * <h2>Usage Example:</h2>
 *
 * <pre>{@code
 * // In service layer - create exception with ExceptionUtils
 * try {
 *     PDDocument doc = PDDocument.load(file);
 * } catch (IOException e) {
 *     throw ExceptionUtils.createPdfCorruptedException("during load", e);
 * }
 *
 * // GlobalExceptionHandler automatically catches and converts to:
 * // HTTP 422 with Problem Detail containing:
 * // - error code: "E001"
 * // - localized message from messages.properties
 * // - RFC 7807 structured response
 * }</pre>
 *
 * @see stirling.software.SPDF.exception.GlobalExceptionHandler
 */
@Slf4j
public class ExceptionUtils {

    private static final String MESSAGES_BUNDLE = "messages";
    private static final Object LOCK = new Object();
    private static final Pattern GS_PAGE_PATTERN =
            Pattern.compile("Page\\s+(\\d+)", Pattern.CASE_INSENSITIVE);
    private static volatile ResourceBundle messages;

    /**
     * Load hints for a given error code from the resource bundle. Looks for keys like:
     * error.E001.hint.1, error.E001.hint.2, etc.
     *
     * @param code the error code (e.g., "E001")
     * @return list of hints
     */
    public static List<String> getHintsForErrorCode(String code) {
        if (code == null) return List.of();

        ResourceBundle bundle = getMessages(java.util.Locale.getDefault());
        List<String> hints = new java.util.ArrayList<>();

        int index = 1;
        StringBuilder keyBuilder = new StringBuilder("error.").append(code).append(".hint.");
        int baseLength = keyBuilder.length();

        while (true) {
            keyBuilder.setLength(baseLength);
            String key = keyBuilder.append(index).toString();
            try {
                String hint = bundle.getString(key);
                hints.add(hint);
                index++;
            } catch (MissingResourceException e) {
                break;
            }
        }

        return hints.isEmpty() ? List.of() : List.copyOf(hints);
    }

    /**
     * Load action required text for a given error code from the resource bundle. Looks for key
     * like: error.E001.action
     *
     * @param code the error code (e.g., "E001")
     * @return action required text, or null if not found
     */
    public static String getActionRequiredForErrorCode(String code) {
        if (code == null) return null;

        ResourceBundle bundle = getMessages(java.util.Locale.getDefault());
        String key = "error." + code + ".action";

        try {
            return bundle.getString(key);
        } catch (MissingResourceException e) {
            return null;
        }
    }

    /**
     * Get or initialize the ResourceBundle with the specified locale. Uses double-checked locking
     * for thread-safe lazy initialization.
     *
     * @param locale the locale for message retrieval
     * @return the ResourceBundle instance
     */
    private static ResourceBundle getMessages(java.util.Locale locale) {
        if (messages == null) {
            synchronized (LOCK) {
                if (messages == null) {
                    try {
                        messages = ResourceBundle.getBundle(MESSAGES_BUNDLE, locale);
                    } catch (MissingResourceException e) {
                        log.warn(
                                "Could not load resource bundle '{}' for locale {}, using default",
                                MESSAGES_BUNDLE,
                                locale);
                        // Create a fallback empty bundle
                        messages =
                                new java.util.ListResourceBundle() {
                                    @Override
                                    protected Object[][] getContents() {
                                        return new Object[0][0];
                                    }
                                };
                    }
                }
            }
        }
        return messages;
    }

    /**
     * Get internationalized message from resource bundle with fallback to default message.
     *
     * @param messageKey the i18n message key
     * @param defaultMessage the default message if i18n is not available
     * @param args optional arguments for the message
     * @return formatted message
     */
    private static String getMessage(String messageKey, String defaultMessage, Object... args) {
        String template = defaultMessage;
        ResourceBundle bundle = getMessages(java.util.Locale.getDefault());

        if (messageKey != null) {
            try {
                template = bundle.getString(messageKey);
            } catch (MissingResourceException e) {
                log.debug("Message key '{}' not found, using default", messageKey);
            }
        }

        // Use MessageFormat for {0}, {1} style placeholders (compatible with properties files)
        return (args != null && args.length > 0) ? MessageFormat.format(template, args) : template;
    }

    /**
     * Get internationalized message from ErrorCode enum.
     *
     * @param errorCode the error code enum
     * @param args optional arguments for the message
     * @return formatted message
     */
    private static String getMessage(ErrorCode errorCode, Object... args) {
        requireNonNull(errorCode, "errorCode");
        return getMessage(errorCode.getMessageKey(), errorCode.getDefaultMessage(), args);
    }

    /**
     * Validate that an object is not null.
     *
     * @param <T> the type of the object
     * @param obj the object to check
     * @param name the name of the parameter (for error message)
     * @return the object if not null
     * @throws IllegalArgumentException if the object is null
     */
    private static <T> T requireNonNull(T obj, String name) {
        if (obj == null) {
            String message = getMessage("error.nullArgument", "{0} must not be null", name);
            throw new IllegalArgumentException(message);
        }
        return obj;
    }

    /**
     * Validates that rendering a PDF page at the given DPI will not exceed safe memory limits. This
     * should be called BEFORE attempting to render to prevent OOM/NegativeArraySizeException.
     *
     * <p>The validation checks if the resulting image dimensions would exceed:
     *
     * <ul>
     *   <li>Java's maximum array size (Integer.MAX_VALUE)
     *   <li>Practical memory limits (considering bytes per pixel)
     * </ul>
     *
     * <p><strong>Usage Example:</strong>
     *
     * <pre>{@code
     * PDPage page = document.getPage(pageIndex);
     * ExceptionUtils.validateRenderingDimensions(page, pageIndex + 1, dpi);
     * // Only render if validation passes
     * BufferedImage image = renderer.renderImageWithDPI(pageIndex, dpi);
     * }</pre>
     *
     * @param page the PDF page to validate
     * @param pageNumber the page number (1-based, for error messages)
     * @param dpi the DPI value to use for rendering
     * @throws OutOfMemoryDpiException if the dimensions would be too large
     */
    public static void validateRenderingDimensions(PDPage page, int pageNumber, int dpi)
            throws OutOfMemoryDpiException {
        if (page == null) {
            return; // Nothing to validate
        }

        PDRectangle mediaBox = page.getMediaBox();
        if (mediaBox == null) {
            return; // Cannot validate without dimensions
        }

        // Get page dimensions in points (1 point = 1/72 inch)
        float widthInPoints = mediaBox.getWidth();
        float heightInPoints = mediaBox.getHeight();

        // Convert to pixels at the given DPI
        // Formula: pixels = (points / 72) * dpi
        long widthInPixels = Math.round((widthInPoints / 72.0) * dpi);
        long heightInPixels = Math.round((heightInPoints / 72.0) * dpi);

        // Check if dimensions exceed Integer.MAX_VALUE
        if (widthInPixels > Integer.MAX_VALUE || heightInPixels > Integer.MAX_VALUE) {
            log.warn(
                    "Page {} dimensions too large: {}x{} pixels at {} DPI",
                    pageNumber,
                    widthInPixels,
                    heightInPixels,
                    dpi);
            throw createOutOfMemoryDpiException(
                    pageNumber,
                    dpi,
                    new IllegalArgumentException(
                            "Dimension exceeds Integer.MAX_VALUE: "
                                    + widthInPixels
                                    + "x"
                                    + heightInPixels));
        }

        // Check if total pixel count would exceed safe limits
        // RGB images use 4 bytes per pixel (ARGB), but be conservative
        long totalPixels = widthInPixels * heightInPixels;
        long estimatedBytes = totalPixels * 4; // 4 bytes per pixel for ARGB

        // Java array max size is Integer.MAX_VALUE elements
        // For byte array: Integer.MAX_VALUE bytes
        // For int array (image pixels): Integer.MAX_VALUE ints = Integer.MAX_VALUE * 4 bytes
        if (totalPixels > Integer.MAX_VALUE) {
            log.warn(
                    "Page {} pixel count too large: {} pixels ({} MB) at {} DPI",
                    pageNumber,
                    totalPixels,
                    estimatedBytes / (1024 * 1024),
                    dpi);
            throw createOutOfMemoryDpiException(
                    pageNumber,
                    dpi,
                    new IllegalArgumentException(
                            "Total pixel count exceeds safe limit: " + totalPixels));
        }

        // Additional safety check: warn about very large images (> 1GB estimated)
        if (estimatedBytes > 1024L * 1024 * 1024) {
            log.warn(
                    "Page {} will create a very large image: {}x{} pixels (~{} MB) at {} DPI. This may cause memory issues.",
                    pageNumber,
                    widthInPixels,
                    heightInPixels,
                    estimatedBytes / (1024 * 1024),
                    dpi);
        }
    }

    /**
     * Execute a PDF rendering operation with automatic OutOfMemory exception handling. This wraps
     * any rendering operation and automatically converts OutOfMemoryError or
     * NegativeArraySizeException into properly typed OutOfMemoryDpiException.
     *
     * <p><strong>Usage Example:</strong>
     *
     * <pre>{@code
     * // Simple - no page number tracking
     * BufferedImage image = ExceptionUtils.handleOomRendering(
     *     300,  // dpi
     *     () -> pdfRenderer.renderImageWithDPI(pageIndex, 300)
     * );
     *
     * // With page number for better error messages
     * BufferedImage image = ExceptionUtils.handleOomRendering(
     *     pageIndex + 1,  // page number (1-based)
     *     300,            // dpi
     *     () -> pdfRenderer.renderImageWithDPI(pageIndex, 300, ImageType.RGB)
     * );
     * }</pre>
     *
     * @param <T> the return type of the rendering operation
     * @param pageNumber the page number being rendered (1-based, for error messages)
     * @param dpi the DPI value used for rendering
     * @param operation the rendering operation to execute
     * @return the result of the rendering operation
     * @throws OutOfMemoryDpiException if OutOfMemoryError or NegativeArraySizeException occurs
     * @throws IOException if any other I/O error occurs during rendering
     */
    public static <T> T handleOomRendering(int pageNumber, int dpi, RenderOperation<T> operation)
            throws IOException {
        try {
            return operation.render();
        } catch (OutOfMemoryError | NegativeArraySizeException e) {
            throw createOutOfMemoryDpiException(pageNumber, dpi, e);
        }
    }

    /**
     * Execute a PDF rendering operation with automatic OutOfMemory exception handling (no page
     * number).
     *
     * <p>Use this variant when you don't have a specific page number context.
     *
     * @param <T> the return type of the rendering operation
     * @param dpi the DPI value used for rendering
     * @param operation the rendering operation to execute
     * @return the result of the rendering operation
     * @throws OutOfMemoryDpiException if OutOfMemoryError or NegativeArraySizeException occurs
     * @throws IOException if any other I/O error occurs during rendering
     */
    public static <T> T handleOomRendering(int dpi, RenderOperation<T> operation)
            throws IOException {
        try {
            return operation.render();
        } catch (OutOfMemoryError | NegativeArraySizeException e) {
            throw createOutOfMemoryDpiException(dpi, e);
        }
    }

    /**
     * Create IllegalArgumentException from ErrorCode with formatted arguments.
     *
     * @param errorCode the error code
     * @param args optional arguments for message formatting
     * @return IllegalArgumentException with formatted message
     */
    public static IllegalArgumentException createIllegalArgumentException(
            ErrorCode errorCode, Object... args) {
        requireNonNull(errorCode, "errorCode");
        String message = getMessage(errorCode, args);
        return new IllegalArgumentException(message);
    }

    /**
     * Create a PdfCorruptedException with internationalized message and context.
     *
     * @param context additional context (e.g., "during merge", "during image extraction")
     * @param cause the original exception
     * @return PdfCorruptedException with user-friendly message
     */
    public static PdfCorruptedException createPdfCorruptedException(
            String context, Exception cause) {
        requireNonNull(cause, "cause");

        String message;
        if (context != null && !context.isEmpty()) {
            String contextKey = "error.pdfCorruptedDuring";
            String defaultMsg =
                    MessageFormat.format(
                            "Error {0}: {1}", context, getMessage(ErrorCode.PDF_CORRUPTED));
            message = getMessage(contextKey, defaultMsg, context);
        } else {
            message =
                    "PDF file appears to be corrupted or damaged. Please try using the 'Repair PDF' feature first to fix the file before proceeding with this operation.";
        }

        return new PdfCorruptedException(message, cause, ErrorCode.PDF_CORRUPTED.getCode());
    }

    /**
     * Create a PdfCorruptedException for multiple corrupted PDFs.
     *
     * @param cause the original exception
     * @return PdfCorruptedException with user-friendly message
     */
    public static PdfCorruptedException createMultiplePdfCorruptedException(Exception cause) {
        requireNonNull(cause, "cause");
        String message = getMessage(ErrorCode.PDF_MULTIPLE_CORRUPTED);
        return new PdfCorruptedException(
                message, cause, ErrorCode.PDF_MULTIPLE_CORRUPTED.getCode());
    }

    /**
     * Create a PdfEncryptionException with internationalized message.
     *
     * @param cause the original exception
     * @return PdfEncryptionException with user-friendly message
     */
    public static PdfEncryptionException createPdfEncryptionException(Exception cause) {
        requireNonNull(cause, "cause");
        String message = getMessage(ErrorCode.PDF_ENCRYPTION);
        return new PdfEncryptionException(message, cause, ErrorCode.PDF_ENCRYPTION.getCode());
    }

    /**
     * Create a PdfPasswordException with internationalized message.
     *
     * @param cause the original exception
     * @return PdfPasswordException with user-friendly message
     */
    public static PdfPasswordException createPdfPasswordException(Exception cause) {
        requireNonNull(cause, "cause");
        String message = getMessage(ErrorCode.PDF_PASSWORD);
        return new PdfPasswordException(message, cause, ErrorCode.PDF_PASSWORD.getCode());
    }

    /**
     * Create a CbrFormatException for corrupted or unsupported CBR/RAR archives.
     *
     * @param message the error message
     * @return CbrFormatException with user-friendly message
     */
    public static CbrFormatException createCbrInvalidFormatException(String message) {
        String fullMessage = message != null ? message : getMessage(ErrorCode.CBR_INVALID_FORMAT);
        return new CbrFormatException(fullMessage, ErrorCode.CBR_INVALID_FORMAT.getCode());
    }

    /**
     * Create a CbrFormatException for encrypted CBR/RAR archives. Note: This now uses
     * CBR_INVALID_FORMAT as encryption is covered by that error.
     *
     * @return CbrFormatException with user-friendly message
     */
    public static CbrFormatException createCbrEncryptedException() {
        String message = getMessage(ErrorCode.CBR_INVALID_FORMAT);
        return new CbrFormatException(message, ErrorCode.CBR_INVALID_FORMAT.getCode());
    }

    /**
     * Create a CbrFormatException for CBR files with no valid images.
     *
     * @return CbrFormatException with user-friendly message
     */
    public static CbrFormatException createCbrNoImagesException() {
        String message = getMessage(ErrorCode.CBR_NO_IMAGES);
        return new CbrFormatException(message, ErrorCode.CBR_NO_IMAGES.getCode());
    }

    /**
     * Create a CbrFormatException for CBR files where images are corrupted beyond recovery.
     *
     * @return CbrFormatException with user-friendly message
     */
    public static CbrFormatException createCbrCorruptedImagesException() {
        String message = getMessage(ErrorCode.CBR_NO_IMAGES);
        return new CbrFormatException(message, ErrorCode.CBR_NO_IMAGES.getCode());
    }

    /**
     * Create a CbrFormatException for non-CBR files.
     *
     * @return CbrFormatException with user-friendly message
     */
    public static CbrFormatException createNotCbrFileException() {
        String message = getMessage(ErrorCode.CBR_NOT_CBR);
        return new CbrFormatException(message, ErrorCode.CBR_NOT_CBR.getCode());
    }

    /**
     * Create a CbzFormatException for invalid CBZ/ZIP archives.
     *
     * @param cause the original exception
     * @return CbzFormatException with user-friendly message
     */
    public static CbzFormatException createCbzInvalidFormatException(Exception cause) {
        String message = getMessage(ErrorCode.CBZ_INVALID_FORMAT);
        return new CbzFormatException(message, cause, ErrorCode.CBZ_INVALID_FORMAT.getCode());
    }

    /**
     * Create a CbzFormatException for empty CBZ archives. Note: This now uses CBZ_INVALID_FORMAT as
     * empty archives are covered by that error.
     *
     * @return CbzFormatException with user-friendly message
     */
    public static CbzFormatException createCbzEmptyException() {
        String message = getMessage(ErrorCode.CBZ_INVALID_FORMAT);
        return new CbzFormatException(message, ErrorCode.CBZ_INVALID_FORMAT.getCode());
    }

    /**
     * Create a CbzFormatException for CBZ files with no valid images.
     *
     * @return CbzFormatException with user-friendly message
     */
    public static CbzFormatException createCbzNoImagesException() {
        String message = getMessage(ErrorCode.CBZ_NO_IMAGES);
        return new CbzFormatException(message, ErrorCode.CBZ_NO_IMAGES.getCode());
    }

    /**
     * Create a CbzFormatException for CBZ files where all images are corrupted. Note: This now uses
     * CBZ_NO_IMAGES as corrupted images are covered by that error.
     *
     * @return CbzFormatException with user-friendly message
     */
    public static CbzFormatException createCbzCorruptedImagesException() {
        String message = getMessage(ErrorCode.CBZ_NO_IMAGES);
        return new CbzFormatException(message, ErrorCode.CBZ_NO_IMAGES.getCode());
    }

    /**
     * Create a CbzFormatException for non-CBZ files.
     *
     * @return CbzFormatException with user-friendly message
     */
    public static CbzFormatException createNotCbzFileException() {
        String message = getMessage(ErrorCode.CBZ_NOT_CBZ);
        return new CbzFormatException(message, ErrorCode.CBZ_NOT_CBZ.getCode());
    }

    /**
     * Create an EmlFormatException for empty or null EML files.
     *
     * @return EmlFormatException with user-friendly message
     */
    public static EmlFormatException createEmlEmptyException() {
        String message = getMessage(ErrorCode.EML_EMPTY);
        return new EmlFormatException(message, ErrorCode.EML_EMPTY.getCode());
    }

    /**
     * Create an EmlFormatException for invalid EML structure.
     *
     * @return EmlFormatException with user-friendly message
     */
    public static EmlFormatException createEmlInvalidFormatException() {
        String message = getMessage(ErrorCode.EML_INVALID_FORMAT);
        return new EmlFormatException(message, ErrorCode.EML_INVALID_FORMAT.getCode());
    }

    /**
     * Create an IOException for file processing errors.
     *
     * @param operation the operation being performed (e.g., "merge", "split", "convert")
     * @param cause the original exception
     * @return IOException with user-friendly message
     */
    public static IOException createFileProcessingException(String operation, Exception cause) {
        requireNonNull(operation, "operation");
        requireNonNull(cause, "cause");
        String message =
                getMessage(
                        ErrorCode.FILE_PROCESSING.getMessageKey(),
                        ErrorCode.FILE_PROCESSING.getDefaultMessage(),
                        operation,
                        cause.getMessage());
        return new IOException(message, cause);
    }

    public static IOException createImageReadException(String filename) {
        requireNonNull(filename, "filename");
        String message =
                getMessage(
                        ErrorCode.IMAGE_READ_ERROR.getMessageKey(),
                        ErrorCode.IMAGE_READ_ERROR.getDefaultMessage(),
                        filename);
        return new IOException(message);
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
        String message = getMessage(messageKey, defaultMessage, args);
        return cause != null ? new IOException(message, cause) : new IOException(message);
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
        String message = getMessage(messageKey, defaultMessage, args);
        return cause != null ? new RuntimeException(message, cause) : new RuntimeException(message);
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
        String message = getMessage(messageKey, defaultMessage, args);
        return new IllegalArgumentException(message);
    }

    /** Create file validation exceptions. */
    public static IllegalArgumentException createHtmlFileRequiredException() {
        String message = getMessage(ErrorCode.HTML_FILE_REQUIRED);
        return new IllegalArgumentException(message);
    }

    public static IllegalArgumentException createPdfFileRequiredException() {
        String message = getMessage(ErrorCode.PDF_NOT_PDF);
        return new IllegalArgumentException(message);
    }

    public static IllegalArgumentException createInvalidPageSizeException(String size) {
        requireNonNull(size, "size");
        String message =
                getMessage(
                        ErrorCode.INVALID_PAGE_SIZE.getMessageKey(),
                        ErrorCode.INVALID_PAGE_SIZE.getDefaultMessage(),
                        size);
        return new IllegalArgumentException(message);
    }

    public static IllegalArgumentException createFileNullOrEmptyException() {
        String message = getMessage(ErrorCode.FILE_NULL_OR_EMPTY);
        return new IllegalArgumentException(message);
    }

    public static IllegalArgumentException createFileNoNameException() {
        String message = getMessage(ErrorCode.FILE_NO_NAME);
        return new IllegalArgumentException(message);
    }

    public static IllegalArgumentException createPdfNoPages() {
        String message = getMessage(ErrorCode.PDF_NO_PAGES);
        return new IllegalArgumentException(message);
    }

    /** Create OCR-related exceptions. */
    public static IOException createOcrLanguageRequiredException() {
        String message = getMessage(ErrorCode.OCR_LANGUAGE_REQUIRED);
        return new IOException(message);
    }

    public static IOException createOcrInvalidLanguagesException() {
        String message = getMessage(ErrorCode.OCR_INVALID_LANGUAGES);
        return new IOException(message);
    }

    public static IOException createOcrToolsUnavailableException() {
        String message = getMessage(ErrorCode.OCR_TOOLS_UNAVAILABLE);
        return new IOException(message);
    }

    public static IOException createOcrInvalidRenderTypeException() {
        String message = getMessage(ErrorCode.OCR_INVALID_RENDER_TYPE);
        return new IOException(message);
    }

    public static IOException createOcrProcessingFailedException(int returnCode) {
        String message =
                getMessage(
                        ErrorCode.OCR_PROCESSING_FAILED.getMessageKey(),
                        ErrorCode.OCR_PROCESSING_FAILED.getDefaultMessage(),
                        returnCode);
        return new IOException(message);
    }

    /** Create system requirement exceptions. */
    public static FfmpegRequiredException createFfmpegRequiredException() {
        String message = getMessage(ErrorCode.FFMPEG_REQUIRED);
        return new FfmpegRequiredException(message, ErrorCode.FFMPEG_REQUIRED.getCode());
    }

    public static IOException createPythonRequiredForWebpException() {
        return createIOException(
                "error.toolRequired", "{0} is required for {1}", null, "Python", "WebP conversion");
    }

    /** Create compression-related exceptions. */
    public static RuntimeException createMd5AlgorithmException(Exception cause) {
        requireNonNull(cause, "cause");
        String message = getMessage(ErrorCode.MD5_ALGORITHM);
        return new RuntimeException(message, cause);
    }

    public static GhostscriptException createGhostscriptCompressionException() {
        return createGhostscriptCompressionException(null, null);
    }

    public static GhostscriptException createGhostscriptCompressionException(String processOutput) {
        return createGhostscriptCompressionException(processOutput, null);
    }

    public static GhostscriptException createGhostscriptCompressionException(Exception cause) {
        requireNonNull(cause, "cause");
        return createGhostscriptCompressionException(cause.getMessage(), cause);
    }

    public static GhostscriptException createGhostscriptCompressionException(
            String processOutput, Exception cause) {
        GhostscriptErrorInfo errorInfo = analyzeGhostscriptOutput(processOutput, cause);
        return buildGhostscriptException(errorInfo, processOutput, cause);
    }

    public static GhostscriptException detectGhostscriptCriticalError(String processOutput) {
        GhostscriptErrorInfo errorInfo = analyzeGhostscriptOutput(processOutput, null);
        if (errorInfo.critical()) {
            return buildGhostscriptException(errorInfo, processOutput, null);
        }
        return null;
    }

    private static GhostscriptException buildGhostscriptException(
            GhostscriptErrorInfo errorInfo, String processOutput, Exception cause) {
        String targetDescription;
        if (errorInfo.affectedPages() != null && !errorInfo.affectedPages().isEmpty()) {
            if (errorInfo.affectedPages().size() == 1) {
                targetDescription = "page " + errorInfo.affectedPages().get(0);
            } else {
                targetDescription =
                        "pages "
                                + String.join(
                                        ", ",
                                        errorInfo.affectedPages().stream()
                                                .map(String::valueOf)
                                                .toArray(String[]::new));
            }
        } else {
            targetDescription = "the input file";
        }

        String diagnostic =
                errorInfo.diagnostic() != null
                        ? errorInfo.diagnostic()
                        : deriveDefaultGhostscriptDiagnostic(processOutput);

        String message;
        if (errorInfo.errorCode() == ErrorCode.GHOSTSCRIPT_PAGE_DRAWING) {
            message =
                    getMessage(
                            errorInfo.errorCode().getMessageKey(),
                            errorInfo.errorCode().getDefaultMessage(),
                            targetDescription,
                            diagnostic);
        } else {
            message = getMessage(errorInfo.errorCode());
            if (errorInfo.diagnostic() != null && !errorInfo.diagnostic().isBlank()) {
                message = message + " " + errorInfo.diagnostic();
            }
        }

        return new GhostscriptException(message, cause, errorInfo.errorCode().getCode());
    }

    private static GhostscriptErrorInfo analyzeGhostscriptOutput(
            String processOutput, Exception cause) {
        String combinedOutput = processOutput;
        if ((combinedOutput == null || combinedOutput.isBlank()) && cause != null) {
            combinedOutput = cause.getMessage();
        }

        if (combinedOutput == null || combinedOutput.isBlank()) {
            return GhostscriptErrorInfo.unknown();
        }

        String[] lines =
                RegexPatternUtils.getInstance().getLineSeparatorPattern().split(combinedOutput);
        List<Integer> affectedPages = new ArrayList<>();
        Set<String> uniqueDiagnostics = new java.util.LinkedHashSet<>();
        boolean recognized = false;
        Integer currentPage = null;

        for (String rawLine : lines) {
            String line = rawLine == null ? "" : rawLine.trim();
            if (line.isEmpty()) {
                continue;
            }

            // Check for page number markers
            Matcher pageMatcher = GS_PAGE_PATTERN.matcher(line);
            if (pageMatcher.find()) {
                try {
                    currentPage = Integer.parseInt(pageMatcher.group(1));
                } catch (NumberFormatException ignore) {
                    // Ignore invalid page numbers and continue parsing
                }
            }

            String lowerLine = line.toLowerCase(Locale.ROOT);
            if (lowerLine.contains("page drawing error")
                    || lowerLine.contains("could not draw this page")
                    || lowerLine.contains("eps files may not contain multiple pages")) {
                recognized = true;

                // Record the page number if we found an error
                if (currentPage != null && !affectedPages.contains(currentPage)) {
                    affectedPages.add(currentPage);
                }

                String normalized = normalizeGhostscriptLine(line);
                if (!normalized.isEmpty() && !normalized.startsWith("GPL Ghostscript")) {
                    uniqueDiagnostics.add(normalized);
                }
            }
        }

        if (recognized) {
            // Build a clean diagnostic message without duplicates
            String diagnostic = String.join(". ", uniqueDiagnostics);
            if (!diagnostic.isEmpty() && diagnostic.charAt(diagnostic.length() - 1) != '.') {
                diagnostic += ".";
            }

            // Use the first page number, or null if none found
            Integer pageNumber = affectedPages.isEmpty() ? null : affectedPages.get(0);

            return new GhostscriptErrorInfo(
                    ErrorCode.GHOSTSCRIPT_PAGE_DRAWING,
                    pageNumber,
                    diagnostic,
                    true,
                    affectedPages);
        }

        // Fallback: capture the first non-empty informative line for context
        for (String rawLine : lines) {
            String line = rawLine == null ? "" : rawLine.trim();
            if (line.isEmpty() || line.startsWith("GPL Ghostscript")) {
                continue;
            }
            String normalized = normalizeGhostscriptLine(line);
            if (!normalized.isEmpty()) {
                return new GhostscriptErrorInfo(
                        ErrorCode.GHOSTSCRIPT_COMPRESSION, null, normalized, false, List.of());
            }
        }

        return new GhostscriptErrorInfo(
                ErrorCode.GHOSTSCRIPT_COMPRESSION, null, null, false, List.of());
    }

    private static String normalizeGhostscriptLine(String line) {
        if (line == null) {
            return "";
        }
        String trimmed = line.trim();
        if (trimmed.isEmpty()) {
            return "";
        }
        return RegexPatternUtils.getInstance()
                .getLeadingAsterisksWhitespacePattern()
                .matcher(trimmed)
                .replaceFirst("");
    }

    private static String deriveDefaultGhostscriptDiagnostic(String processOutput) {
        return getMessage(
                "error.ghostscriptDefaultDiagnostic",
                "The source file contains content Ghostscript cannot render.");
    }

    public static IOException createGhostscriptConversionException(String outputType) {
        requireNonNull(outputType, "outputType");
        String message =
                getMessage(
                        ErrorCode.GHOSTSCRIPT_COMPRESSION.getMessageKey(),
                        ErrorCode.GHOSTSCRIPT_COMPRESSION.getDefaultMessage(),
                        outputType);
        return new IOException(message);
    }

    public static IOException createProcessingInterruptedException(
            String processType, InterruptedException cause) {
        requireNonNull(processType, "processType");
        requireNonNull(cause, "cause");
        String message =
                getMessage(
                        ErrorCode.PROCESSING_INTERRUPTED.getMessageKey(),
                        ErrorCode.PROCESSING_INTERRUPTED.getDefaultMessage(),
                        processType);
        return new IOException(message, cause);
    }

    public static RuntimeException createPdfaConversionFailedException() {
        String message = getMessage(ErrorCode.PDFA_CONVERSION_FAILED);
        return new RuntimeException(message);
    }

    public static IllegalArgumentException createInvalidArgumentException(
            String argumentName, String value) {
        requireNonNull(argumentName, "argumentName");
        requireNonNull(value, "value");
        String message =
                getMessage(
                        ErrorCode.INVALID_ARGUMENT.getMessageKey(),
                        ErrorCode.INVALID_ARGUMENT.getDefaultMessage(),
                        argumentName,
                        value);
        return new IllegalArgumentException(message);
    }

    public static IllegalArgumentException createNullArgumentException(String argumentName) {
        requireNonNull(argumentName, "argumentName");
        String message =
                getMessage(
                        ErrorCode.NULL_ARGUMENT.getMessageKey(),
                        ErrorCode.NULL_ARGUMENT.getDefaultMessage(),
                        argumentName);
        return new IllegalArgumentException(message);
    }

    /**
     * Create a RequestValidationException for @Valid payloads.
     *
     * @return RequestValidationException with user-friendly message
     */
    public static RequestValidationException createRequestValidationException() {
        String message = getMessage(ErrorCode.REQUEST_VALIDATION_FAILED);
        return new RequestValidationException(
                message, ErrorCode.REQUEST_VALIDATION_FAILED.getCode());
    }

    /**
     * Create an OutOfMemoryDpiException for memory/image size errors when rendering PDF images with
     * DPI. Handles OutOfMemoryError and related conditions (e.g., NegativeArraySizeException) that
     * result from images exceeding Java's array/memory limits.
     *
     * @param pageNumber the page number that caused the error
     * @param dpi the DPI value used
     * @param cause the original error/exception (e.g., OutOfMemoryError,
     *     NegativeArraySizeException)
     * @return OutOfMemoryDpiException with user-friendly message
     */
    public static OutOfMemoryDpiException createOutOfMemoryDpiException(
            int pageNumber, int dpi, Throwable cause) {
        requireNonNull(cause, "cause");
        String message =
                getMessage(
                        ErrorCode.OUT_OF_MEMORY_DPI.getMessageKey(),
                        ErrorCode.OUT_OF_MEMORY_DPI.getDefaultMessage(),
                        pageNumber,
                        dpi);
        return new OutOfMemoryDpiException(message, cause, ErrorCode.OUT_OF_MEMORY_DPI.getCode());
    }

    /**
     * Create an OutOfMemoryDpiException for OutOfMemoryError when rendering PDF images with DPI.
     *
     * @param pageNumber the page number that caused the error
     * @param dpi the DPI value used
     * @param cause the original OutOfMemoryError
     * @return OutOfMemoryDpiException with user-friendly message
     */
    public static OutOfMemoryDpiException createOutOfMemoryDpiException(
            int pageNumber, int dpi, OutOfMemoryError cause) {
        return createOutOfMemoryDpiException(pageNumber, dpi, (Throwable) cause);
    }

    /**
     * Create an OutOfMemoryDpiException for memory/image size errors when rendering PDF images with
     * DPI. Handles OutOfMemoryError and related conditions (e.g., NegativeArraySizeException) that
     * result from images exceeding Java's array/memory limits.
     *
     * @param dpi the DPI value used
     * @param cause the original error/exception (e.g., OutOfMemoryError,
     *     NegativeArraySizeException)
     * @return OutOfMemoryDpiException with user-friendly message
     */
    public static OutOfMemoryDpiException createOutOfMemoryDpiException(int dpi, Throwable cause) {
        requireNonNull(cause, "cause");
        String message =
                getMessage(
                        ErrorCode.OUT_OF_MEMORY_DPI.getMessageKey(),
                        ErrorCode.OUT_OF_MEMORY_DPI.getDefaultMessage(),
                        dpi);
        return new OutOfMemoryDpiException(message, cause, ErrorCode.OUT_OF_MEMORY_DPI.getCode());
    }

    /**
     * Create an OutOfMemoryDpiException for OutOfMemoryError when rendering PDF images with DPI.
     *
     * @param dpi the DPI value used
     * @param cause the original OutOfMemoryError
     * @return OutOfMemoryDpiException with user-friendly message
     */
    public static OutOfMemoryDpiException createOutOfMemoryDpiException(
            int dpi, OutOfMemoryError cause) {
        return createOutOfMemoryDpiException(dpi, (Throwable) cause);
    }

    /**
     * Check if an exception indicates a corrupted PDF and wrap it with appropriate message.
     *
     * @param e the exception to check
     * @return the original exception if not PDF corruption, or a new PdfCorruptedException with
     *     user-friendly message
     */
    public static IOException handlePdfException(IOException e) {
        return handlePdfException(e, null);
    }

    /**
     * Check if an exception indicates a corrupted PDF and wrap it with appropriate message.
     *
     * @param e the exception to check
     * @param context additional context for the error
     * @return the original exception if not PDF corruption, or a new exception with user-friendly
     *     message
     */
    public static IOException handlePdfException(IOException e, String context) {
        requireNonNull(e, "exception");

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
     * Log an exception with appropriate level based on its type. Returns the exception for fluent
     * log-and-throw pattern.
     *
     * @param <T> the exception type
     * @param operation the operation being performed
     * @param exception the exception that occurred
     * @return the exception (for fluent log-and-throw)
     */
    public static <T extends Exception> T logException(String operation, T exception) {
        requireNonNull(operation, "operation");
        requireNonNull(exception, "exception");

        if (PdfErrorUtils.isCorruptedPdfError(exception)) {
            log.warn("PDF corruption detected during {}: {}", operation, exception.getMessage());
        } else if (exception instanceof IOException
                && (isEncryptionError((IOException) exception)
                        || isPasswordError((IOException) exception))) {
            log.info("PDF security issue during {}: {}", operation, exception.getMessage());
        } else {
            log.error("Unexpected error during {}", operation, exception);
        }

        return exception;
    }

    /**
     * Wrap a generic exception with appropriate context for better error reporting. This method is
     * useful when catching exceptions in controllers and wanting to provide better context to
     * GlobalExceptionHandler.
     *
     * @param e the exception to wrap
     * @param operation the operation being performed (e.g., "PDF merge", "image extraction")
     * @return a RuntimeException wrapping the original exception with operation context
     */
    public static RuntimeException wrapException(Exception e, String operation) {
        requireNonNull(e, "exception");
        requireNonNull(operation, "operation");

        if (e instanceof RuntimeException) {
            return (RuntimeException) e;
        }

        if (e instanceof IOException) {
            IOException ioException = handlePdfException((IOException) e, operation);
            // BaseAppException extends IOException, wrap it in RuntimeException for rethrowing
            if (ioException instanceof BaseAppException) {
                return new RuntimeException(ioException);
            }
            return new RuntimeException(createFileProcessingException(operation, e));
        }

        return new RuntimeException(
                MessageFormat.format("Error during {0}: {1}", operation, e.getMessage()), e);
    }

    /**
     * Error codes for consistent error tracking and documentation. Each error code includes a
     * unique identifier, i18n message key, and default message.
     *
     * <p>These codes are used by {@link stirling.software.SPDF.exception.GlobalExceptionHandler} to
     * provide consistent RFC 7807 Problem Details responses.
     */
    @Getter
    public enum ErrorCode {
        // PDF-related errors
        PDF_CORRUPTED(
                "E001",
                "error.pdfCorrupted",
                "PDF file appears to be corrupted or damaged. Please try using the 'Repair PDF' feature first to fix the file before proceeding with this operation."),
        PDF_MULTIPLE_CORRUPTED(
                "E002",
                "error.multiplePdfCorrupted",
                "One or more PDF files appear to be corrupted or damaged. Please try using the 'Repair PDF' feature on each file first before attempting to merge them."),
        PDF_ENCRYPTION(
                "E003",
                "error.pdfEncryption",
                "The PDF appears to have corrupted encryption data. This can happen when the PDF was created with incompatible encryption methods. Please try using the 'Repair PDF' feature first, or contact the document creator for a new copy."),
        PDF_PASSWORD(
                "E004",
                "error.pdfPassword",
                "The PDF Document is passworded and either the password was not provided or was incorrect"),
        PDF_NO_PAGES("E005", "error.pdfNoPages", "PDF file contains no pages"),
        PDF_NOT_PDF("E006", "error.notPdfFile", "File must be in PDF format"),

        // CBR/CBZ errors
        CBR_INVALID_FORMAT(
                "E010",
                "error.cbrInvalidFormat",
                "Invalid or corrupted CBR/RAR archive. The file may be corrupted, use an unsupported RAR format (RAR5+), encrypted, or may not be a valid RAR archive."),
        CBR_NO_IMAGES(
                "E012",
                "error.cbrNoImages",
                "No valid images found in the CBR file. The archive may be empty, or all images may be corrupted or in unsupported formats."),
        CBR_NOT_CBR("E014", "error.notCbrFile", "File must be a CBR or RAR archive"),
        CBZ_INVALID_FORMAT(
                "E015",
                "error.cbzInvalidFormat",
                "Invalid or corrupted CBZ/ZIP archive. The file may be empty, corrupted, or may not be a valid ZIP archive."),
        CBZ_NO_IMAGES(
                "E016",
                "error.cbzNoImages",
                "No valid images found in the CBZ file. The archive may be empty, or all images may be corrupted or in unsupported formats."),
        CBZ_NOT_CBZ("E018", "error.notCbzFile", "File must be a CBZ or ZIP archive"),

        // EML errors
        EML_EMPTY("E020", "error.emlEmpty", "EML file is empty or null"),
        EML_INVALID_FORMAT("E021", "error.emlInvalidFormat", "Invalid EML file format"),

        // File processing errors
        FILE_NOT_FOUND("E030", "error.fileNotFound", "File not found with ID: {0}"),
        FILE_PROCESSING(
                "E031",
                "error.fileProcessing",
                "An error occurred while processing the file during {0} operation: {1}"),
        FILE_NULL_OR_EMPTY("E032", "error.fileNullOrEmpty", "File cannot be null or empty"),
        FILE_NO_NAME("E033", "error.fileNoName", "File must have a name"),
        IMAGE_READ_ERROR("E034", "error.imageReadError", "Unable to read image from file: {0}"),

        // OCR errors
        OCR_LANGUAGE_REQUIRED(
                "E040", "error.ocrLanguageRequired", "OCR language options are not specified"),
        OCR_INVALID_LANGUAGES(
                "E041",
                "error.ocrInvalidLanguages",
                "Invalid OCR languages format: none of the selected languages are valid"),
        OCR_TOOLS_UNAVAILABLE("E042", "error.ocrToolsUnavailable", "OCR tools are not installed"),
        OCR_INVALID_RENDER_TYPE(
                "E043",
                "error.ocrInvalidRenderType",
                "Invalid OCR render type. Must be 'hocr' or 'sandwich'"),
        OCR_PROCESSING_FAILED(
                "E044", "error.ocrProcessingFailed", "OCRmyPDF failed with return code: {0}"),

        // Compression errors
        COMPRESSION_OPTIONS(
                "E050",
                "error.compressionOptions",
                "Compression options are not specified (expected output size and optimize level)"),
        GHOSTSCRIPT_COMPRESSION(
                "E051", "error.ghostscriptCompression", "Ghostscript compression command failed"),
        QPDF_COMPRESSION("E052", "error.qpdfCompression", "QPDF command failed"),
        PROCESSING_INTERRUPTED(
                "E053", "error.processingInterrupted", "{0} processing was interrupted"),
        GHOSTSCRIPT_PAGE_DRAWING(
                "E054", "error.ghostscriptPageDrawing", "Ghostscript could not render {0}. {1}"),

        // Conversion errors
        PDFA_CONVERSION_FAILED("E060", "error.pdfaConversionFailed", "PDF/A conversion failed"),
        HTML_FILE_REQUIRED("E061", "error.htmlFileRequired", "File must be in HTML or ZIP format"),
        PYTHON_REQUIRED_WEBP(
                "E062", "error.pythonRequiredWebp", "Python is required for WebP conversion"),
        FFMPEG_REQUIRED(
                "E063",
                "error.ffmpegRequired",
                "FFmpeg must be installed to convert PDFs to video. Install FFmpeg and ensure it is available on the system PATH."),

        // Validation errors
        INVALID_ARGUMENT("E070", "error.invalidArgument", "Invalid argument ''{0}'': {1}"),
        NULL_ARGUMENT("E071", "error.nullArgument", "{0} must not be null"),
        INVALID_PAGE_SIZE("E072", "error.invalidPageSize", "Invalid page size format: {0}"),
        INVALID_COMPARATOR(
                "E073",
                "error.invalidComparator",
                "Invalid comparator format: only 'greater', 'equal', and 'less' are supported"),
        REQUEST_VALIDATION_FAILED(
                "E074", "error.requestValidationFailed", "Request validation failed"),

        // System errors
        MD5_ALGORITHM("E080", "error.md5Algorithm", "MD5 algorithm not available"),
        OUT_OF_MEMORY_DPI(
                "E081",
                "error.outOfMemoryDpi",
                "Out of memory or image-too-large error while rendering PDF page {0} at {1} DPI. This can occur when the resulting image exceeds Java's array/memory limits (e.g., NegativeArraySizeException). Please use a lower DPI value (recommended: 150 or less) or process the document in smaller chunks.");

        private final String code;
        private final String messageKey;
        private final String defaultMessage;

        ErrorCode(String code, String messageKey, String defaultMessage) {
            this.code = code;
            this.messageKey = messageKey;
            this.defaultMessage = defaultMessage;
        }
    }

    /**
     * Functional interface for PDF rendering operations that may throw OutOfMemoryError or
     * NegativeArraySizeException.
     *
     * @param <T> the return type of the operation
     */
    @FunctionalInterface
    public interface RenderOperation<T> {
        T render() throws IOException;
    }

    /**
     * Common interface for exceptions that provide error codes.
     *
     * <p>This interface enables polymorphic handling of different exception types (BaseAppException
     * and BaseValidationException) without using instanceof checks.
     *
     * @see BaseAppException
     * @see BaseValidationException
     */
    public interface ErrorCodeProvider {
        /**
         * Get the error message.
         *
         * @return the error message
         */
        String getMessage();

        /**
         * Get the error code.
         *
         * @return the error code (e.g., "E001")
         */
        String getErrorCode();
    }

    /** Exception thrown when Ghostscript fails to render or compress a file. */
    public static class GhostscriptException extends BaseAppException {
        public GhostscriptException(String message, Throwable cause, String errorCode) {
            super(message, cause, errorCode);
        }
    }

    /** Exception thrown when FFmpeg is not available on the host system. */
    public static class FfmpegRequiredException extends BaseAppException {
        public FfmpegRequiredException(String message, String errorCode) {
            super(message, null, errorCode);
        }

        public FfmpegRequiredException(String message, Throwable cause, String errorCode) {
            super(message, cause, errorCode);
        }
    }

    private record GhostscriptErrorInfo(
            ErrorCode errorCode,
            Integer pageNumber,
            String diagnostic,
            boolean critical,
            List<Integer> affectedPages) {
        private GhostscriptErrorInfo(
                ErrorCode errorCode,
                Integer pageNumber,
                String diagnostic,
                boolean critical,
                List<Integer> affectedPages) {
            this.errorCode = errorCode;
            this.pageNumber = pageNumber;
            this.diagnostic = diagnostic;
            this.critical = critical;
            this.affectedPages = affectedPages != null ? affectedPages : List.of();
        }

        private static GhostscriptErrorInfo unknown() {
            return new GhostscriptErrorInfo(
                    ErrorCode.GHOSTSCRIPT_COMPRESSION, null, null, false, List.of());
        }
    }

    /** Base exception with error code support for IO-related errors. */
    public abstract static class BaseAppException extends IOException implements ErrorCodeProvider {
        @Getter(onMethod_ = {@Override})
        private final String errorCode;

        protected BaseAppException(String message, Throwable cause, String errorCode) {
            super(message, cause);
            this.errorCode = errorCode;
        }
    }

    /** Base exception with error code support for illegal argument errors. */
    public abstract static class BaseValidationException extends IllegalArgumentException
            implements ErrorCodeProvider {
        @Getter(onMethod_ = {@Override})
        private final String errorCode;

        protected BaseValidationException(String message, String errorCode) {
            super(message);
            this.errorCode = errorCode;
        }

        protected BaseValidationException(String message, Throwable cause, String errorCode) {
            super(message, cause);
            this.errorCode = errorCode;
        }
    }

    /** Exception thrown when request validation fails for @Valid payloads. */
    public static class RequestValidationException extends BaseValidationException {
        public RequestValidationException(String message, String errorCode) {
            super(message, errorCode);
        }

        public RequestValidationException(String message, Throwable cause, String errorCode) {
            super(message, cause, errorCode);
        }
    }

    /** Exception thrown when a PDF file is corrupted or damaged. */
    public static class PdfCorruptedException extends BaseAppException {
        public PdfCorruptedException(String message, Throwable cause, String errorCode) {
            super(message, cause, errorCode);
        }
    }

    /** Exception thrown when a PDF has encryption/decryption issues. */
    public static class PdfEncryptionException extends BaseAppException {
        public PdfEncryptionException(String message, Throwable cause, String errorCode) {
            super(message, cause, errorCode);
        }
    }

    /** Exception thrown when PDF password is incorrect or missing. */
    public static class PdfPasswordException extends BaseAppException {
        public PdfPasswordException(String message, Throwable cause, String errorCode) {
            super(message, cause, errorCode);
        }
    }

    /** Exception thrown when CBR/RAR archive is invalid or unsupported. */
    public static class CbrFormatException extends BaseValidationException {
        public CbrFormatException(String message, String errorCode) {
            super(message, errorCode);
        }

        public CbrFormatException(String message, Throwable cause, String errorCode) {
            super(message, cause, errorCode);
        }
    }

    /** Exception thrown when CBZ/ZIP archive is invalid. */
    public static class CbzFormatException extends BaseValidationException {
        public CbzFormatException(String message, String errorCode) {
            super(message, errorCode);
        }

        public CbzFormatException(String message, Throwable cause, String errorCode) {
            super(message, cause, errorCode);
        }
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

    /** Exception thrown when EML file format is invalid. */
    public static class EmlFormatException extends BaseValidationException {
        public EmlFormatException(String message, String errorCode) {
            super(message, errorCode);
        }
    }

    /** Exception thrown when rendering PDF pages causes out-of-memory or array size errors. */
    public static class OutOfMemoryDpiException extends BaseAppException {
        public OutOfMemoryDpiException(String message, Throwable cause, String errorCode) {
            super(message, cause, errorCode);
        }
    }
}
