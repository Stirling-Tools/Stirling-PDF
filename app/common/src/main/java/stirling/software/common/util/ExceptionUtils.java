package stirling.software.common.util;

import java.io.IOException;
import java.text.MessageFormat;
import java.util.List;
import java.util.MissingResourceException;
import java.util.ResourceBundle;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

/**
 * Utility class for handling exceptions with internationalized error messages. Provides consistent
 * error handling and user-friendly messages across the application.
 *
 * <p>This class works in harmony with {@code GlobalExceptionHandler} to provide a complete
 * exception handling solution:
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
    private static volatile ResourceBundle messages;

    // No static initialization block needed - hints and actions are now loaded from properties
    // files

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
        while (true) {
            String key = "error." + code + ".hint." + index;
            try {
                String hint = bundle.getString(key);
                hints.add(hint);
                index++;
            } catch (MissingResourceException e) {
                // No more hints for this code
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

    // Old static initialization code removed - replaced with dynamic loading from properties
    @Deprecated
    @SuppressWarnings("unused")
    private static void legacyStaticInitialization() {
        // This method is deprecated and no longer used
        // All hints and actions are now loaded dynamically from messages.properties
        // See getHintsForErrorCode() and getActionRequiredForErrorCode() methods
        /*
        // All error hints and actions are now loaded from messages.properties
        // See getHintsForErrorCode() and getActionRequiredForErrorCode() methods
        */
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

    /* OLD LEGACY CODE REMOVED - OVER 400 LINES OF STATIC INITIALIZATION
     * All hints are now dynamically loaded from messages_en_GB.properties
     * Example:
        // E004: PDF_PASSWORD
        ERROR_HINTS.put(
                ErrorCode.PDF_PASSWORD.code,
                List.of(
                        "PDFs can have two passwords: a user password (opens the document) and an owner password (controls permissions). This operation requires the owner password.",
                        "If you can open the PDF without a password, it may only have an owner password set. Try submitting the permissions password.",
                        "Digitally signed PDFs cannot have security removed until the signature is removed.",
                        "Passwords are case-sensitive. Verify capitalization, spaces, and special characters.",
                        "Some creators use different encryption standards (40-bit, 128-bit, 256-bit AES). Ensure your password matches the encryption used.",
                        "If you only have the user password, you cannot remove security restrictions. Contact the document owner for the permissions password."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.PDF_PASSWORD.code,
                "Provide the owner/permissions password, not just the document open password.");

        // E005: PDF_NO_PAGES
        ERROR_HINTS.put(
                ErrorCode.PDF_NO_PAGES.code,
                List.of(
                        "Verify the PDF is not empty or contains only unsupported objects.",
                        "Open the file in a PDF viewer to confirm it has pages.",
                        "Recreate the PDF ensuring pages are included (not just attachments)."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.PDF_NO_PAGES.code, "Provide a PDF that contains at least one page.");

        // E006: PDF_NOT_PDF
        ERROR_HINTS.put(
                ErrorCode.PDF_NOT_PDF.code,
                List.of(
                        "Ensure the uploaded file is a valid PDF, not another format.",
                        "If it has a .pdf extension, verify the file is not actually another type (e.g., Word, image).",
                        "Try opening the file in a PDF reader to confirm validity."));
        ERROR_ACTION_REQUIRED.put(ErrorCode.PDF_NOT_PDF.code, "Upload a valid PDF file.");

        // ------------------------------
        // CBR/CBZ errors
        // ------------------------------
        // E010: CBR_INVALID_FORMAT
        ERROR_HINTS.put(
                ErrorCode.CBR_INVALID_FORMAT.code,
                List.of(
                        "RAR5 archives are not supported. Repack the archive as RAR4 or convert to CBZ (ZIP).",
                        "Ensure the archive is not encrypted and contains valid image files.",
                        "Try extracting the archive with a desktop tool to verify integrity."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.CBR_INVALID_FORMAT.code,
                "Convert the archive to CBZ/ZIP or RAR4, then retry.");

        // E012: CBR_NO_IMAGES
        ERROR_HINTS.put(
                ErrorCode.CBR_NO_IMAGES.code,
                List.of(
                        "Make sure the archive contains image files (e.g., .jpg, .png).",
                        "Remove unsupported or corrupted files from the archive.",
                        "Repack the archive ensuring images are at the root or in proper folders."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.CBR_NO_IMAGES.code,
                "Add at least one valid image to the archive and retry.");

        // E014: CBR_NOT_CBR
        ERROR_HINTS.put(
                ErrorCode.CBR_NOT_CBR.code,
                List.of(
                        "Upload a CBR (RAR) file for this operation.",
                        "If you have a ZIP/CBZ, use the CBZ conversion instead.",
                        "Check the file extension and actual format with an archive tool."));
        ERROR_ACTION_REQUIRED.put(ErrorCode.CBR_NOT_CBR.code, "Provide a valid CBR/RAR file.");

        // E015: CBZ_INVALID_FORMAT
        ERROR_HINTS.put(
                ErrorCode.CBZ_INVALID_FORMAT.code,
                List.of(
                        "Ensure the ZIP/CBZ is not encrypted and is a valid archive.",
                        "Verify the archive is not empty and contains image files.",
                        "Try re-zipping the images using a standard ZIP tool (no compression anomalies)."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.CBZ_INVALID_FORMAT.code,
                "Recreate the CBZ/ZIP without encryption and with valid images, then retry.");

        // E016: CBZ_NO_IMAGES
        ERROR_HINTS.put(
                ErrorCode.CBZ_NO_IMAGES.code,
                List.of(
                        "Add images (.jpg, .png, etc.) to the ZIP archive.",
                        "Remove non-image files or nested archives that aren't supported.",
                        "Ensure images are not corrupted and can be opened locally."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.CBZ_NO_IMAGES.code, "Include at least one valid image in the CBZ file.");

        // E018: CBZ_NOT_CBZ
        ERROR_HINTS.put(
                ErrorCode.CBZ_NOT_CBZ.code,
                List.of(
                        "Upload a CBZ (ZIP) file for this operation.",
                        "If you have a RAR/CBR, use the CBR conversion instead.",
                        "Check the file extension and actual format with an archive tool."));
        ERROR_ACTION_REQUIRED.put(ErrorCode.CBZ_NOT_CBZ.code, "Provide a valid CBZ/ZIP file.");

        // ------------------------------
        // EML errors
        // ------------------------------
        // E020: EML_EMPTY
        ERROR_HINTS.put(
                ErrorCode.EML_EMPTY.code,
                List.of(
                        "Verify the uploaded file is not zero bytes.",
                        "Export the EML again from your email client.",
                        "Ensure the file hasn't been stripped of content by email/security tools."));
        ERROR_ACTION_REQUIRED.put(ErrorCode.EML_EMPTY.code, "Upload a non-empty EML file.");

        // E021: EML_INVALID_FORMAT
        ERROR_HINTS.put(
                ErrorCode.EML_INVALID_FORMAT.code,
                List.of(
                        "Ensure the file is a raw EML message, not MSG or another email format.",
                        "Re-export the email as EML from your client.",
                        "Open the file with a text editor to verify standard EML headers are present."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.EML_INVALID_FORMAT.code, "Provide a valid EML file export.");

        // ------------------------------
        // File processing errors
        // ------------------------------
        // E030: FILE_NOT_FOUND
        ERROR_HINTS.put(
                ErrorCode.FILE_NOT_FOUND.code,
                List.of(
                        "Confirm the file ID or path is correct.",
                        "Ensure the file wasn't deleted or moved.",
                        "If using a temporary upload, re-upload the file and try again."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.FILE_NOT_FOUND.code, "Provide an existing file reference and retry.");

        // E031: FILE_PROCESSING
        ERROR_HINTS.put(
                ErrorCode.FILE_PROCESSING.code,
                List.of(
                        "Check that the file is not corrupted and is supported by this operation.",
                        "Retry the operation; transient I/O issues can occur.",
                        "If the problem persists, simplify the document (fewer pages, smaller images)."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.FILE_PROCESSING.code,
                "Verify the file and operation parameters, then retry.");

        // E032: FILE_NULL_OR_EMPTY
        ERROR_HINTS.put(
                ErrorCode.FILE_NULL_OR_EMPTY.code,
                List.of(
                        "Attach a file in the request.",
                        "Make sure the file is not zero bytes.",
                        "If uploading multiple files, ensure at least one is provided."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.FILE_NULL_OR_EMPTY.code, "Upload a non-empty file and retry.");

        // E033: FILE_NO_NAME
        ERROR_HINTS.put(
                ErrorCode.FILE_NO_NAME.code,
                List.of(
                        "Provide a filename with an extension.",
                        "Ensure your client includes the original filename during upload."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.FILE_NO_NAME.code, "Include a filename for the uploaded file.");

        // E034: IMAGE_READ_ERROR
        ERROR_HINTS.put(
                ErrorCode.IMAGE_READ_ERROR.code,
                List.of(
                        "Verify the image file is not corrupted and can be opened locally.",
                        "Ensure the file format is a supported image type.",
                        "Re-export or convert the image to a standard format (JPEG/PNG)."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.IMAGE_READ_ERROR.code, "Provide a readable, supported image file.");

        // ------------------------------
        // OCR errors
        // ------------------------------
        // E040: OCR_LANGUAGE_REQUIRED
        ERROR_HINTS.put(
                ErrorCode.OCR_LANGUAGE_REQUIRED.code,
                List.of(
                        "Select at least one OCR language from the options.",
                        "If unsure, choose the primary language of the document's text.",
                        "Multiple languages can be selected if mixed text is present."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.OCR_LANGUAGE_REQUIRED.code, "Specify one or more OCR languages.");

        // E041: OCR_INVALID_LANGUAGES
        ERROR_HINTS.put(
                ErrorCode.OCR_INVALID_LANGUAGES.code,
                List.of(
                        "Use valid language codes (e.g., eng, fra, deu).",
                        "Remove unsupported or misspelled language codes.",
                        "Check installed OCR language packs and install missing ones."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.OCR_INVALID_LANGUAGES.code,
                "Provide valid OCR language codes or install missing language packs.");

        // E042: OCR_TOOLS_UNAVAILABLE
        ERROR_HINTS.put(
                ErrorCode.OCR_TOOLS_UNAVAILABLE.code,
                List.of(
                        "Install OCR tools (e.g., OCRmyPDF/Tesseract) as per documentation.",
                        "Verify the tools are on the PATH and accessible by the application.",
                        "If running in Docker, use an image variant that includes OCR tools."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.OCR_TOOLS_UNAVAILABLE.code, "Install and configure the OCR tools.");

        // E043: OCR_INVALID_RENDER_TYPE
        ERROR_HINTS.put(
                ErrorCode.OCR_INVALID_RENDER_TYPE.code,
                List.of(
                        "Use 'hocr' for HTML OCR output or 'sandwich' to embed text in PDF.",
                        "Check the API docs for valid render types.",
                        "Avoid typos; values are case-sensitive."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.OCR_INVALID_RENDER_TYPE.code,
                "Choose either 'hocr' or 'sandwich' as render type.");

        // E044: OCR_PROCESSING_FAILED
        ERROR_HINTS.put(
                ErrorCode.OCR_PROCESSING_FAILED.code,
                List.of(
                        "Check the server logs for the detailed OCRmyPDF error output.",
                        "Ensure required OCR dependencies and language packs are installed.",
                        "Try running OCR locally on the file to reproduce the issue."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.OCR_PROCESSING_FAILED.code,
                "Investigate OCR logs and fix missing dependencies or inputs, then retry.");

        // ------------------------------
        // Compression/processing errors
        // ------------------------------
        // E050: COMPRESSION_OPTIONS
        ERROR_HINTS.put(
                ErrorCode.COMPRESSION_OPTIONS.code,
                List.of(
                        "Provide both target output size and optimization level.",
                        "Review API docs for required compression parameters.",
                        "If unsure, start with default optimization and adjust."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.COMPRESSION_OPTIONS.code,
                "Specify expected output size and optimize level for compression.");

        // E051: GHOSTSCRIPT_COMPRESSION
        ERROR_HINTS.put(
                ErrorCode.GHOSTSCRIPT_COMPRESSION.code,
                List.of(
                        "Confirm Ghostscript is installed and accessible.",
                        "Simplify the PDF (e.g., reduce image sizes) and retry.",
                        "Review command-line arguments generated for Ghostscript in logs."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.GHOSTSCRIPT_COMPRESSION.code,
                "Ensure Ghostscript is installed and the command executes successfully.");

        // E052: QPDF_COMPRESSION
        ERROR_HINTS.put(
                ErrorCode.QPDF_COMPRESSION.code,
                List.of(
                        "Ensure qpdf is installed and on PATH.",
                        "Verify that the PDF is not corrupted before compression.",
                        "Adjust compression parameters if the command fails."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.QPDF_COMPRESSION.code, "Install qpdf and retry with valid inputs.");

        // E053: PROCESSING_INTERRUPTED
        ERROR_HINTS.put(
                ErrorCode.PROCESSING_INTERRUPTED.code,
                List.of(
                        "The operation was canceled or interrupted by the system.",
                        "Avoid terminating the process or closing the browser mid-operation.",
                        "Retry the operation; if it persists, check server resource limits."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.PROCESSING_INTERRUPTED.code,
                "Retry the operation and avoid interruption.");

        // ------------------------------
        // Conversion/System errors
        // ------------------------------
        // E060: PDFA_CONVERSION_FAILED
        ERROR_HINTS.put(
                ErrorCode.PDFA_CONVERSION_FAILED.code,
                List.of(
                        "Ensure the PDF is valid and supported by the converter.",
                        "Try converting to a different PDF/A level or re-export the source to PDF first.",
                        "Remove problematic elements (e.g., complex transparency) and retry."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.PDFA_CONVERSION_FAILED.code,
                "Adjust conversion settings or normalize the PDF, then retry.");

        // E061: HTML_FILE_REQUIRED
        ERROR_HINTS.put(
                ErrorCode.HTML_FILE_REQUIRED.code,
                List.of(
                        "Provide either a single HTML file or a ZIP containing HTML and assets.",
                        "Ensure relative links in HTML point to included assets in the ZIP."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.HTML_FILE_REQUIRED.code,
                "Upload an HTML file or a ZIP of the website content.");

        // E062: PYTHON_REQUIRED_WEBP
        ERROR_HINTS.put(
                ErrorCode.PYTHON_REQUIRED_WEBP.code,
                List.of(
                        "Install Python and required WebP libraries to enable conversion.",
                        "If using Docker, use an image variant with Python/WebP support.",
                        "Check PATH and environment to ensure Python is available."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.PYTHON_REQUIRED_WEBP.code, "Install Python and WebP dependencies.");

        // ------------------------------
        // Validation errors
        // ------------------------------
        // E070: INVALID_ARGUMENT
        ERROR_HINTS.put(
                ErrorCode.INVALID_ARGUMENT.code,
                List.of(
                        "Review the parameter's allowed values in the API docs.",
                        "Ensure the value format matches expectations (case, range, pattern).",
                        "Correct the argument and resend the request."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.INVALID_ARGUMENT.code, "Provide a valid parameter value and retry.");

        // E071: NULL_ARGUMENT
        ERROR_HINTS.put(
                ErrorCode.NULL_ARGUMENT.code,
                List.of(
                        "Include the missing parameter in the request.",
                        "Verify your client sends all required fields."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.NULL_ARGUMENT.code, "Add the required parameter and retry.");

        // E072: INVALID_PAGE_SIZE
        ERROR_HINTS.put(
                ErrorCode.INVALID_PAGE_SIZE.code,
                List.of(
                        "Use formats like 'A4', 'Letter', or 'WIDTHxHEIGHT' (e.g., 800x600).",
                        "Ensure units and separators are correct.",
                        "Refer to docs for supported sizes."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.INVALID_PAGE_SIZE.code, "Provide a supported page size value.");

        // E073: INVALID_COMPARATOR
        ERROR_HINTS.put(
                ErrorCode.INVALID_COMPARATOR.code,
                List.of(
                        "Allowed values: 'greater', 'equal', 'less'.",
                        "Check for typos and use lowercase.",
                        "Consult API docs for comparator usage examples."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.INVALID_COMPARATOR.code,
                "Use one of 'greater', 'equal', or 'less' as comparator.");

        // ------------------------------
        // System errors
        // ------------------------------
        // E080: MD5_ALGORITHM
        ERROR_HINTS.put(
                ErrorCode.MD5_ALGORITHM.code,
                List.of(
                        "Your Java runtime may not include MD5. Use an alternative algorithm.",
                        "If hashing is optional, switch to SHA-256 or another supported digest.",
                        "Install appropriate security providers if MD5 is required."));
        ERROR_ACTION_REQUIRED.put(
                ErrorCode.MD5_ALGORITHM.code,
                "Use a supported hash algorithm (e.g., SHA-256) or install MD5 provider.");

        // E081: OUT_OF_MEMORY_DPI
        ERROR_HINTS.put(
                ErrorCode.OUT_OF_MEMORY_DPI.code,
                List.of(
                        "Reduce the DPI (try 150 or lower).",
                        "Process the document in smaller chunks or fewer pages at a time.",
                        ... (over 400 lines removed) ...
    */

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
            throw new IllegalArgumentException(name + " cannot be null");
        }
        return obj;
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
            // Use error.pdfCorruptedDuring key if available in properties, otherwise fallback to
            // constructed message
            String contextKey = "error.pdfCorruptedDuring";
            String defaultMsg =
                    MessageFormat.format(
                            "Error {0}: {1}", context, getMessage(ErrorCode.PDF_CORRUPTED));
            message = getMessage(contextKey, defaultMsg, context);
        } else {
            message = getMessage(ErrorCode.PDF_CORRUPTED);
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
     * Create a CbrFormatException for CBR files where all images are corrupted. Note: This now uses
     * CBR_NO_IMAGES as corrupted images are covered by that error.
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
     * Create an EmlFormatException for invalid EML file format.
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
    public static IOException createPythonRequiredForWebpException() {
        String message = getMessage(ErrorCode.PYTHON_REQUIRED_WEBP);
        return new IOException(message);
    }

    /** Create compression-related exceptions. */
    public static RuntimeException createMd5AlgorithmException(Exception cause) {
        requireNonNull(cause, "cause");
        String message = getMessage(ErrorCode.MD5_ALGORITHM);
        return new RuntimeException(message, cause);
    }

    public static IOException createGhostscriptCompressionException() {
        String message = getMessage(ErrorCode.GHOSTSCRIPT_COMPRESSION);
        return new IOException(message);
    }

    public static IOException createGhostscriptCompressionException(Exception cause) {
        requireNonNull(cause, "cause");
        String message = getMessage(ErrorCode.GHOSTSCRIPT_COMPRESSION);
        return new IOException(message, cause);
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
     * Get ErrorCode enum by its code string.
     *
     * @param code the error code (e.g., "E001")
     * @return the matching ErrorCode, or null if not found
     */
    public static ErrorCode getErrorCodeByCode(String code) {
        if (code == null) return null;
        for (ErrorCode errorCode : ErrorCode.values()) {
            if (errorCode.getCode().equals(code)) {
                return errorCode;
            }
        }
        return null;
    }

    /**
     * Get ErrorCode enum by its message key.
     *
     * @param messageKey the i18n message key (e.g., "error.pdfCorrupted")
     * @return the matching ErrorCode, or null if not found
     */
    public static ErrorCode getErrorCodeByMessageKey(String messageKey) {
        if (messageKey == null) return null;
        for (ErrorCode errorCode : ErrorCode.values()) {
            if (errorCode.getMessageKey().equals(messageKey)) {
                return errorCode;
            }
        }
        return null;
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

        // Conversion errors
        PDFA_CONVERSION_FAILED("E060", "error.pdfaConversionFailed", "PDF/A conversion failed"),
        HTML_FILE_REQUIRED("E061", "error.htmlFileRequired", "File must be in HTML or ZIP format"),
        PYTHON_REQUIRED_WEBP(
                "E062", "error.pythonRequiredWebp", "Python is required for WebP conversion"),

        // Validation errors
        INVALID_ARGUMENT("E070", "error.invalidArgument", "Invalid argument: {0}"),
        NULL_ARGUMENT("E071", "error.nullArgument", "{0} must not be null"),
        INVALID_PAGE_SIZE("E072", "error.invalidPageSize", "Invalid page size format: {0}"),
        INVALID_COMPARATOR(
                "E073",
                "error.invalidComparator",
                "Invalid comparator format: only 'greater', 'equal', and 'less' are supported"),

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

    /** Base exception with error code support for IO-related errors. */
    @Getter
    public abstract static class BaseAppException extends IOException {
        private final String errorCode;

        protected BaseAppException(String message, Throwable cause, String errorCode) {
            super(message, cause);
            this.errorCode = errorCode;
        }
    }

    /** Base exception with error code support for illegal argument errors. */
    @Getter
    public abstract static class BaseValidationException extends IllegalArgumentException {
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
