package stirling.software.SPDF.exception;

import java.io.IOException;
import java.net.URI;
import java.time.Instant;
import java.util.List;

import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.NoHandlerFoundException;

import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.ExceptionUtils.*;
import stirling.software.common.util.RegexPatternUtils;

import tools.jackson.databind.ObjectMapper;

/**
 * Returns RFC 7807 Problem Details for HTTP APIs, ensuring consistent error responses across the
 * application.
 *
 * <h2>Exception Handler Hierarchy:</h2>
 *
 * <ol>
 *   <li>Application Exceptions (extends BaseAppException)
 *       <ul>
 *         <li>{@link PdfPasswordException} - 400 Bad Request (user-provided input issue)
 *         <li>{@link OutOfMemoryDpiException} - 400 Bad Request (user-provided parameter issue)
 *         <li>{@link PdfCorruptedException} - 400 Bad Request (invalid file content)
 *         <li>{@link PdfEncryptionException} - 400 Bad Request (invalid file content)
 *         <li>{@link GhostscriptException} - 500 Internal Server Error (external process failure)
 *         <li>Other {@link BaseAppException} - 500 Internal Server Error
 *       </ul>
 *   <li>Validation Exceptions (extends BaseValidationException)
 *       <ul>
 *         <li>{@link CbrFormatException} - 400 Bad Request
 *         <li>{@link CbzFormatException} - 400 Bad Request
 *         <li>{@link EmlFormatException} - 400 Bad Request
 *         <li>Other {@link BaseValidationException} - 400 Bad Request
 *       </ul>
 *   <li>Spring Framework Exceptions
 *       <ul>
 *         <li>{@link MethodArgumentNotValidException} - 400 Bad Request
 *         <li>{@link MissingServletRequestParameterException} - 400 Bad Request
 *         <li>{@link MissingServletRequestPartException} - 400 Bad Request
 *         <li>{@link MaxUploadSizeExceededException} - 413 Payload Too Large
 *         <li>{@link HttpRequestMethodNotSupportedException} - 405 Method Not Allowed
 *         <li>{@link HttpMediaTypeNotSupportedException} - 415 Unsupported Media Type
 *         <li>{@link HttpMessageNotReadableException} - 400 Bad Request
 *         <li>{@link NoHandlerFoundException} - 404 Not Found
 *       </ul>
 *   <li>Java Standard Exceptions
 *       <ul>
 *         <li>{@link IllegalArgumentException} - 400 Bad Request
 *         <li>{@link IOException} - 500 Internal Server Error
 *         <li>{@link Exception} - 500 Internal Server Error (catch-all)
 *       </ul>
 * </ol>
 *
 * <h2>Usage Examples:</h2>
 *
 * <pre>{@code
 * // In controllers/services - use ExceptionUtils to create typed exceptions:
 * try {
 *     PDDocument doc = Loader.loadPDF(file);
 * } catch (IOException e) {
 *     throw ExceptionUtils.createPdfCorruptedException("during load", e);
 * }
 * // -> GlobalExceptionHandler catches it and returns HTTP 422 with Problem Detail
 *
 * // For validation errors:
 * if (file == null || file.isEmpty()) {
 *     throw ExceptionUtils.createFileNullOrEmptyException();
 * }
 * // -> Returns HTTP 400 with error code "E032"
 *
 * // Spring validation automatically handled:
 * public void processFile(@Valid FileRequest request) { ... }
 * // -> Returns HTTP 400 with field-level validation errors
 *
 * // File size limits automatically enforced:
 * // -> Returns HTTP 413 when upload exceeds spring.servlet.multipart.max-file-size
 * }</pre>
 *
 * <h2>Best Practices:</h2>
 *
 * <ul>
 *   <li>Use {@link ExceptionUtils} factory methods to create exceptions (ensures error codes)
 *   <li>Add context to exceptions (e.g., "during merge" helps debugging)
 *   <li>Let this handler convert exceptions to HTTP responses (don't return ResponseEntity from
 *       controllers)
 *   <li>Check messages.properties for localized error messages before adding new ones
 * </ul>
 *
 * <h2>Creating Custom Exceptions:</h2>
 *
 * <pre>{@code
 * // 1. Register a new error code in ExceptionUtils.ErrorCode enum:
 * CUSTOM_ERROR("E999", "Custom error occurred"),
 *
 * // 2. Create a new exception class in ExceptionUtils:
 * public static class CustomException extends BaseAppException {
 *     public CustomException(String message, Throwable cause, String errorCode) {
 *         super(message, cause, errorCode);
 *     }
 * }
 *
 * // 3. Create factory method in ExceptionUtils:
 * public static CustomException createCustomException(String context) {
 *     String message = getLocalizedMessage(
 *         ErrorCode.CUSTOM_ERROR,
 *         "Custom operation failed");
 *     return new CustomException(
 *         message + " " + context,
 *         null,
 *         ErrorCode.CUSTOM_ERROR.getCode());
 * }
 *
 * // 4. Add handler in GlobalExceptionHandler:
 * @ExceptionHandler(CustomException.class)
 * public ResponseEntity<ProblemDetail> handleCustomException(
 *         CustomException ex, HttpServletRequest request) {
 *     logException("error", "Custom", request, ex, ex.getErrorCode());
 *     String title = getLocalizedMessage(
 *         "error.custom.title",
 *         ErrorTitles.CUSTOM_DEFAULT);
 *     return createProblemDetailResponse(
 *         ex, HttpStatus.BAD_REQUEST, ErrorTypes.CUSTOM, title, request);
 * }
 *
 * // 5. Add localized messages in messages.properties:
 * error.E999=Custom error occurred
 * error.E999.hint.1=Check the input parameters
 * error.E999.hint.2=Verify the configuration
 * error.E999.actionRequired=Review and correct the request
 * error.custom.title=Custom Error
 * }</pre>
 *
 * @see <a href="https://datatracker.ietf.org/doc/html/rfc7807">RFC 7807: Problem Details for HTTP
 *     APIs</a>
 * @see ExceptionUtils
 */
@Slf4j
@RestControllerAdvice
@RequiredArgsConstructor
public class GlobalExceptionHandler {

    private final MessageSource messageSource;
    private final Environment environment;

    private static final org.springframework.http.MediaType PROBLEM_JSON =
            org.springframework.http.MediaType.APPLICATION_PROBLEM_JSON;

    private Boolean isDevelopmentMode;

    /**
     * Create a base ProblemDetail with common properties (timestamp, path).
     *
     * <p>This method provides a foundation for all ProblemDetail responses with standardized
     * metadata.
     *
     * @param status the HTTP status code
     * @param detail the problem detail message
     * @param request the HTTP servlet request
     * @return a ProblemDetail with timestamp and path properties set
     */
    private static ProblemDetail createBaseProblemDetail(
            HttpStatus status, String detail, HttpServletRequest request) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(status, detail);
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());
        return problemDetail;
    }

    /**
     * Checks whether the given IOException indicates that the client disconnected before the
     * response could be written (broken pipe, connection reset, etc.). When this happens there is
     * no point in serialising a {@link ProblemDetail} body because the socket is already closed —
     * and attempting to do so may trigger a secondary {@code HttpMessageNotWritableException} if
     * the response Content-Type was already committed as a non-JSON type (e.g. image/png).
     */
    private static boolean isClientDisconnectException(IOException ex) {
        // Walk the causal chain — Jetty/Tomcat may wrap the low-level SocketException
        Throwable current = ex;
        while (current != null) {
            String msg = current.getMessage();
            if (msg != null) {
                String lower = msg.toLowerCase(java.util.Locale.ROOT);
                if (lower.contains("broken pipe")
                        || lower.contains("connection reset")
                        || lower.contains("an established connection was aborted")) {
                    return true;
                }
            }
            current = current.getCause();
        }
        return false;
    }

    /**
     * Helper method to create a standardized ProblemDetail response for exceptions with error
     * codes.
     *
     * <p>This method uses the {@link ExceptionUtils.ErrorCodeProvider} interface for type-safe
     * polymorphic handling of both {@link BaseAppException} and {@link BaseValidationException},
     * which are created by {@link ExceptionUtils} factory methods.
     *
     * <p>The error codes follow the format defined in {@link ExceptionUtils.ErrorCode} enum,
     * ensuring consistency across the application.
     *
     * @param ex the exception implementing ErrorCodeProvider interface
     * @param status the HTTP status
     * @param typeUri the problem type URI
     * @param title the problem title
     * @param request the HTTP servlet request
     * @return ResponseEntity with ProblemDetail including errorCode property
     */
    private static ResponseEntity<ProblemDetail> createProblemDetailResponse(
            ExceptionUtils.ErrorCodeProvider ex,
            HttpStatus status,
            String typeUri,
            String title,
            HttpServletRequest request) {

        ProblemDetail problemDetail = createBaseProblemDetail(status, ex.getMessage(), request);
        problemDetail.setType(URI.create(typeUri));
        problemDetail.setTitle(title);
        // Also set as property to ensure serialization (Spring Boot compatibility)
        problemDetail.setProperty("title", title);
        problemDetail.setProperty("errorCode", ex.getErrorCode());

        // Attach hints and actionRequired from centralized registry (single call)
        enrichWithErrorMetadata(problemDetail, ex.getErrorCode());

        return ResponseEntity.status(status).contentType(PROBLEM_JSON).body(problemDetail);
    }

    /**
     * Log exception with standardized format and appropriate log level.
     *
     * @param level the log level ("debug", "warn", "error")
     * @param category the error category (e.g., "Validation", "PDF")
     * @param request the HTTP servlet request
     * @param ex the exception to log
     * @param errorCode the error code (optional)
     */
    private static void logException(
            String level,
            String category,
            HttpServletRequest request,
            Exception ex,
            String errorCode) {
        String message =
                errorCode != null
                        ? String.format(
                                "%s error at %s: %s (%s)",
                                category, request.getRequestURI(), ex.getMessage(), errorCode)
                        : String.format(
                                "%s error at %s: %s",
                                category, request.getRequestURI(), ex.getMessage());

        switch (level.toLowerCase()) {
            case "warn" -> log.warn(message);
            case "error" -> log.error(message, ex);
            default -> log.debug(message);
        }
    }

    /**
     * Enrich ProblemDetail with error metadata (hints and action required) from error code
     * registry.
     *
     * <p>This method retrieves hints and actionRequired text for the given error code from the
     * centralized error code registry in ExceptionUtils.
     *
     * @param problemDetail the ProblemDetail to enrich
     * @param errorCode the error code to look up
     */
    private static void enrichWithErrorMetadata(ProblemDetail problemDetail, String errorCode) {
        List<String> hints = ExceptionUtils.getHintsForErrorCode(errorCode);
        if (!hints.isEmpty()) {
            problemDetail.setProperty("hints", hints);
        }

        String actionRequired = ExceptionUtils.getActionRequiredForErrorCode(errorCode);
        if (actionRequired != null && !actionRequired.isBlank()) {
            problemDetail.setProperty("actionRequired", actionRequired);
        }
    }

    /**
     * Handle PDF password exceptions.
     *
     * <p>When thrown: When a PDF file requires a password that was not provided or is incorrect.
     *
     * <p>Client action: Prompt the user to provide the correct PDF password and retry the request.
     *
     * <p>Related: {@link ExceptionUtils#createPdfPasswordException(Exception)}
     *
     * @param ex the PdfPasswordException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 400 BAD_REQUEST (changed from 422 for better client
     *     compatibility)
     */
    @ExceptionHandler(PdfPasswordException.class)
    public ResponseEntity<ProblemDetail> handlePdfPassword(
            PdfPasswordException ex, HttpServletRequest request) {
        logException("warn", "PDF password", request, ex, ex.getErrorCode());

        String title =
                getLocalizedMessage("error.pdfPassword.title", ErrorTitles.PDF_PASSWORD_DEFAULT);
        return createProblemDetailResponse(
                ex, HttpStatus.BAD_REQUEST, ErrorTypes.PDF_PASSWORD, title, request);
    }

    /**
     * Handle Ghostscript processing exceptions originating from external binaries.
     *
     * @param ex the GhostscriptException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 500 INTERNAL_SERVER_ERROR (external process failure)
     */
    @ExceptionHandler(GhostscriptException.class)
    public ResponseEntity<ProblemDetail> handleGhostscriptException(
            GhostscriptException ex, HttpServletRequest request) {
        logException("warn", "Ghostscript", request, ex, ex.getErrorCode());

        String title =
                getLocalizedMessage(
                        "error.ghostscriptCompression.title", ErrorTitles.GHOSTSCRIPT_DEFAULT);
        return createProblemDetailResponse(
                ex, HttpStatus.INTERNAL_SERVER_ERROR, ErrorTypes.GHOSTSCRIPT, title, request);
    }

    /**
     * Handle FFmpeg dependency missing errors when media conversion endpoints are invoked.
     *
     * @param ex the FfmpegRequiredException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 503 SERVICE_UNAVAILABLE
     */
    @ExceptionHandler(FfmpegRequiredException.class)
    public ResponseEntity<ProblemDetail> handleFfmpegRequired(
            FfmpegRequiredException ex, HttpServletRequest request) {
        logException("warn", "FFmpeg unavailable", request, ex, ex.getErrorCode());

        String title =
                getLocalizedMessage(
                        "error.ffmpegRequired.title", ErrorTitles.FFMPEG_REQUIRED_DEFAULT);
        return createProblemDetailResponse(
                ex, HttpStatus.SERVICE_UNAVAILABLE, ErrorTypes.FFMPEG_REQUIRED, title, request);
    }

    /**
     * Handle PDF and DPI-related BaseAppException subtypes.
     *
     * <p>Related factory methods in {@link ExceptionUtils}:
     *
     * <ul>
     *   <li>{@link ExceptionUtils#createPdfCorruptedException(String, Exception)}
     *   <li>{@link ExceptionUtils#createPdfEncryptionException(Exception)}
     *   <li>{@link ExceptionUtils#createOutOfMemoryDpiException(int, int, Throwable)}
     * </ul>
     *
     * @param ex the BaseAppException
     * @param request the HTTP servlet request
     * @return ProblemDetail with appropriate HTTP status
     */
    @ExceptionHandler({
        PdfCorruptedException.class,
        PdfEncryptionException.class,
        OutOfMemoryDpiException.class
    })
    public ResponseEntity<ProblemDetail> handlePdfAndDpiExceptions(
            BaseAppException ex, HttpServletRequest request) {

        HttpStatus status;
        String type;
        String title;
        String category;

        if (ex instanceof OutOfMemoryDpiException) {
            // Use BAD_REQUEST for better client compatibility (was 422/507)
            status = HttpStatus.BAD_REQUEST;
            type = ErrorTypes.OUT_OF_MEMORY_DPI;
            title =
                    getLocalizedMessage(
                            "error.outOfMemoryDpi.title", ErrorTitles.OUT_OF_MEMORY_DPI_DEFAULT);
            category = "Out of Memory DPI";
        } else if (ex instanceof PdfCorruptedException) {
            // Use BAD_REQUEST for better client compatibility (was 422)
            status = HttpStatus.BAD_REQUEST;
            type = ErrorTypes.PDF_CORRUPTED;
            title =
                    getLocalizedMessage(
                            "error.pdfCorrupted.title", ErrorTitles.PDF_CORRUPTED_DEFAULT);
            category = "PDF Corrupted";
        } else if (ex instanceof PdfEncryptionException) {
            // Use BAD_REQUEST for better client compatibility (was 422)
            status = HttpStatus.BAD_REQUEST;
            type = ErrorTypes.PDF_ENCRYPTION;
            title =
                    getLocalizedMessage(
                            "error.pdfEncryption.title", ErrorTitles.PDF_ENCRYPTION_DEFAULT);
            category = "PDF Encryption";
        } else {
            status = HttpStatus.BAD_REQUEST;
            type = ErrorTypes.APP_ERROR;
            title = getLocalizedMessage("error.application.title", ErrorTitles.APPLICATION_DEFAULT);
            category = "Application";
        }

        logException("error", category, request, ex, ex.getErrorCode());
        return createProblemDetailResponse(ex, status, type, title, request);
    }

    /**
     * Handle archive format validation exceptions.
     *
     * <p>Related factory methods in {@link ExceptionUtils}:
     *
     * <ul>
     *   <li>{@link ExceptionUtils#createCbrInvalidFormatException(String)}
     *   <li>{@link ExceptionUtils#createCbzInvalidFormatException(Exception)}
     *   <li>{@link ExceptionUtils#createEmlInvalidFormatException()}
     * </ul>
     *
     * @param ex the format exception
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 400 BAD_REQUEST
     */
    @ExceptionHandler({
        CbrFormatException.class,
        CbzFormatException.class,
        EmlFormatException.class
    })
    public ResponseEntity<ProblemDetail> handleFormatExceptions(
            BaseValidationException ex, HttpServletRequest request) {

        String type;
        String title;
        String category;

        if (ex instanceof CbrFormatException) {
            type = ErrorTypes.CBR_FORMAT;
            title = getLocalizedMessage("error.cbrFormat.title", ErrorTitles.CBR_FORMAT_DEFAULT);
            category = "CBR format";
        } else if (ex instanceof CbzFormatException) {
            type = ErrorTypes.CBZ_FORMAT;
            title = getLocalizedMessage("error.cbzFormat.title", ErrorTitles.CBZ_FORMAT_DEFAULT);
            category = "CBZ format";
        } else if (ex instanceof EmlFormatException) {
            type = ErrorTypes.EML_FORMAT;
            title = getLocalizedMessage("error.emlFormat.title", ErrorTitles.EML_FORMAT_DEFAULT);
            category = "EML format";
        } else {
            type = ErrorTypes.FORMAT_ERROR;
            title =
                    getLocalizedMessage(
                            "error.formatError.title", ErrorTitles.FORMAT_ERROR_DEFAULT);
            category = "Format";
        }

        logException("warn", category, request, ex, ex.getErrorCode());
        return createProblemDetailResponse(ex, HttpStatus.BAD_REQUEST, type, title, request);
    }

    /**
     * Handle generic validation exceptions.
     *
     * @param ex the BaseValidationException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 400 BAD_REQUEST
     */
    @ExceptionHandler(BaseValidationException.class)
    public ResponseEntity<ProblemDetail> handleValidation(
            BaseValidationException ex, HttpServletRequest request) {
        logException("warn", "Validation", request, ex, ex.getErrorCode());
        String title =
                getLocalizedMessage("error.validation.title", ErrorTitles.VALIDATION_DEFAULT);
        return createProblemDetailResponse(
                ex, HttpStatus.BAD_REQUEST, ErrorTypes.VALIDATION, title, request);
    }

    /**
     * Handle all BaseAppException subtypes not handled by specific handlers.
     *
     * @param ex the BaseAppException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 500 INTERNAL_SERVER_ERROR
     */
    @ExceptionHandler(BaseAppException.class)
    public ResponseEntity<ProblemDetail> handleBaseApp(
            BaseAppException ex, HttpServletRequest request) {
        logException("error", "Application", request, ex, ex.getErrorCode());
        String title =
                getLocalizedMessage("error.application.title", ErrorTitles.APPLICATION_DEFAULT);
        return createProblemDetailResponse(
                ex, HttpStatus.INTERNAL_SERVER_ERROR, ErrorTypes.APPLICATION, title, request);
    }

    /**
     * Handle Bean Validation errors from @Valid annotations.
     *
     * <p>When thrown: When request body or parameters fail @Valid constraint validations.
     *
     * <p>Client action: Review the 'errors' field in the response for specific validation failures
     * and correct the request payload.
     *
     * @param ex the MethodArgumentNotValidException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 400 BAD_REQUEST
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetail> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpServletRequest request) {
        log.warn(
                "Bean validation error at {}: {} field errors",
                request.getRequestURI(),
                ex.getBindingResult().getErrorCount());

        List<String> errors =
                ex.getBindingResult().getFieldErrors().stream()
                        .map(
                                error ->
                                        String.format(
                                                "%s: %s",
                                                error.getField(), error.getDefaultMessage()))
                        .toList();

        String title =
                getLocalizedMessage(
                        "error.validation.title", ErrorTitles.REQUEST_VALIDATION_FAILED_DEFAULT);
        String detail = getLocalizedMessage("error.validation.detail", "Validation failed");

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.BAD_REQUEST, detail, request);
        problemDetail.setType(URI.create(ErrorTypes.VALIDATION));
        problemDetail.setTitle(title);
        problemDetail.setProperty("title", title); // Ensure serialization
        problemDetail.setProperty("errors", errors);
        addStandardHints(
                problemDetail,
                "error.validation.hints",
                List.of(
                        "Review the 'errors' list and correct the specified fields.",
                        "Ensure data types and formats match the API schema.",
                        "Resend the request after fixing validation issues."));
        problemDetail.setProperty(
                "actionRequired", "Correct the invalid fields and resend the request.");

        return ResponseEntity.badRequest().contentType(PROBLEM_JSON).body(problemDetail);
    }

    /**
     * Handle missing request parameters.
     *
     * <p>When thrown: When a required @RequestParam is missing from the request.
     *
     * <p>Client action: Add the missing parameter specified in 'parameterName' to the request.
     *
     * @param ex the MissingServletRequestParameterException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 400 BAD_REQUEST
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ProblemDetail> handleMissingParameter(
            MissingServletRequestParameterException ex, HttpServletRequest request) {
        log.warn("Missing parameter at {}: {}", request.getRequestURI(), ex.getParameterName());

        String message =
                getLocalizedMessage(
                        "error.missingParameter.detail",
                        String.format(
                                "Required parameter '%s' of type '%s' is missing",
                                ex.getParameterName(), ex.getParameterType()),
                        ex.getParameterName(),
                        ex.getParameterType());

        String title =
                getLocalizedMessage(
                        "error.missingParameter.title", ErrorTitles.MISSING_PARAMETER_DEFAULT);

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.BAD_REQUEST, message, request);
        problemDetail.setType(URI.create(ErrorTypes.MISSING_PARAMETER));
        problemDetail.setTitle(title);
        problemDetail.setProperty("title", title); // Ensure serialization
        problemDetail.setProperty("parameterName", ex.getParameterName());
        problemDetail.setProperty("parameterType", ex.getParameterType());
        addStandardHints(
                problemDetail,
                "error.missingParameter.hints",
                List.of(
                        "Add the missing parameter to the query string or form data.",
                        "Verify the parameter name is spelled correctly.",
                        "Provide a value matching the required type."));
        problemDetail.setProperty(
                "actionRequired",
                String.format("Add the required '%s' parameter and retry.", ex.getParameterName()));

        return ResponseEntity.badRequest().contentType(PROBLEM_JSON).body(problemDetail);
    }

    /**
     * Handle missing multipart file in request.
     *
     * <p>When thrown: When a required @RequestPart (file upload) is missing from a multipart
     * request.
     *
     * <p>Client action: Include the missing file part specified in 'partName' in the multipart
     * request.
     *
     * @param ex the MissingServletRequestPartException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 400 BAD_REQUEST
     */
    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<ProblemDetail> handleMissingPart(
            MissingServletRequestPartException ex, HttpServletRequest request) {
        log.warn("Missing file part at {}: {}", request.getRequestURI(), ex.getRequestPartName());

        String message =
                getLocalizedMessage(
                        "error.missingFile.detail",
                        String.format(
                                "Required file part '%s' is missing", ex.getRequestPartName()),
                        ex.getRequestPartName());

        String title =
                getLocalizedMessage("error.missingFile.title", ErrorTitles.MISSING_FILE_DEFAULT);

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.BAD_REQUEST, message, request);
        problemDetail.setType(URI.create(ErrorTypes.MISSING_FILE));
        problemDetail.setTitle(title);
        problemDetail.setProperty("title", title); // Ensure serialization
        problemDetail.setProperty("partName", ex.getRequestPartName());
        addStandardHints(
                problemDetail,
                "error.missingFile.hints",
                List.of(
                        "Attach the missing file part to the multipart/form-data request.",
                        "Ensure the field name matches the API specification.",
                        "Check that your client is sending multipart data correctly."));
        problemDetail.setProperty(
                "actionRequired",
                String.format("Attach the '%s' file part and retry.", ex.getRequestPartName()));

        return ResponseEntity.badRequest().contentType(PROBLEM_JSON).body(problemDetail);
    }

    /**
     * Handle file upload size exceeded.
     *
     * <p>When thrown: When an uploaded file exceeds the maximum size configured in
     * spring.servlet.multipart.max-file-size.
     *
     * <p>Client action: Reduce the file size or split into smaller files. Check 'maxSizeMB'
     * property for the limit.
     *
     * @param ex the MaxUploadSizeExceededException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 413 PAYLOAD_TOO_LARGE
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ProblemDetail> handleMaxUploadSize(
            MaxUploadSizeExceededException ex, HttpServletRequest request) {
        log.warn("File upload size exceeded at {}", request.getRequestURI());

        long maxSize = ex.getMaxUploadSize();
        String message =
                maxSize > 0
                        ? getLocalizedMessage(
                                "error.fileTooLarge.detail",
                                String.format(
                                        "File size exceeds maximum allowed limit of %d MB",
                                        maxSize / (1024 * 1024)),
                                maxSize / (1024 * 1024))
                        : getLocalizedMessage(
                                "error.fileTooLarge.detailUnknown",
                                "File size exceeds maximum allowed limit");

        String title =
                getLocalizedMessage("error.fileTooLarge.title", ErrorTitles.FILE_TOO_LARGE_DEFAULT);

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.PAYLOAD_TOO_LARGE, message, request);
        problemDetail.setType(URI.create(ErrorTypes.FILE_TOO_LARGE));
        problemDetail.setTitle(title);
        problemDetail.setProperty("title", title); // Ensure serialization
        if (maxSize > 0) {
            problemDetail.setProperty("maxSizeBytes", maxSize);
            problemDetail.setProperty("maxSizeMB", maxSize / (1024 * 1024));
        }
        addStandardHints(
                problemDetail,
                "error.fileTooLarge.hints",
                List.of(
                        "Compress or reduce the resolution of the file before uploading.",
                        "Split the file into smaller parts if possible.",
                        "Contact the administrator to increase the upload limit if necessary."));
        problemDetail.setProperty(
                "actionRequired", "Reduce the file size to be within the upload limit.");

        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .contentType(PROBLEM_JSON)
                .body(problemDetail);
    }

    /**
     * Handle HTTP method not supported.
     *
     * <p>When thrown: When a request uses an HTTP method (GET, POST, etc.) not supported by the
     * endpoint.
     *
     * <p>Client action: Use one of the supported methods listed in 'supportedMethods' property.
     *
     * @param ex the HttpRequestMethodNotSupportedException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 405 METHOD_NOT_ALLOWED
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ProblemDetail> handleMethodNotSupported(
            HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {
        log.warn(
                "Method not supported at {}: {} not allowed",
                request.getRequestURI(),
                ex.getMethod());

        String message =
                getLocalizedMessage(
                        "error.methodNotAllowed.detail",
                        String.format(
                                "HTTP method '%s' is not supported for this endpoint. Supported methods: %s",
                                ex.getMethod(), String.join(", ", ex.getSupportedMethods())),
                        ex.getMethod(),
                        String.join(", ", ex.getSupportedMethods()));

        String title =
                getLocalizedMessage(
                        "error.methodNotAllowed.title", ErrorTitles.METHOD_NOT_ALLOWED_DEFAULT);

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.METHOD_NOT_ALLOWED, message, request);
        problemDetail.setType(URI.create(ErrorTypes.METHOD_NOT_ALLOWED));
        problemDetail.setTitle(title);
        problemDetail.setProperty("title", title); // Ensure serialization
        problemDetail.setProperty("method", ex.getMethod());
        problemDetail.setProperty("supportedMethods", ex.getSupportedMethods());
        addStandardHints(
                problemDetail,
                "error.methodNotAllowed.hints",
                List.of(
                        "Change the HTTP method to one of the supported methods.",
                        "Consult the API documentation for the correct method.",
                        "If using a tool like curl or Postman, update the method accordingly."));
        problemDetail.setProperty("actionRequired", "Use one of the supported HTTP methods.");

        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .contentType(PROBLEM_JSON)
                .body(problemDetail);
    }

    /**
     * Handle unsupported media type.
     *
     * <p>When thrown: When the Content-Type header contains a media type not supported by the
     * endpoint.
     *
     * <p>Client action: Change the Content-Type header to one of the supported types in
     * 'supportedMediaTypes' property.
     *
     * @param ex the HttpMediaTypeNotSupportedException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 415 UNSUPPORTED_MEDIA_TYPE
     */
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ProblemDetail> handleMediaTypeNotSupported(
            HttpMediaTypeNotSupportedException ex, HttpServletRequest request) {
        log.warn(
                "Media type not supported at {}: {}", request.getRequestURI(), ex.getContentType());

        String message =
                getLocalizedMessage(
                        "error.unsupportedMediaType.detail",
                        String.format(
                                "Media type '%s' is not supported. Supported media types: %s",
                                ex.getContentType(), ex.getSupportedMediaTypes()),
                        String.valueOf(ex.getContentType()),
                        ex.getSupportedMediaTypes().toString());

        String title =
                getLocalizedMessage(
                        "error.unsupportedMediaType.title",
                        ErrorTitles.UNSUPPORTED_MEDIA_TYPE_DEFAULT);

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.UNSUPPORTED_MEDIA_TYPE, message, request);
        problemDetail.setType(URI.create(ErrorTypes.UNSUPPORTED_MEDIA_TYPE));
        problemDetail.setTitle(title);
        problemDetail.setProperty("title", title); // Ensure serialization
        problemDetail.setProperty("contentType", String.valueOf(ex.getContentType()));
        problemDetail.setProperty("supportedMediaTypes", ex.getSupportedMediaTypes());
        addStandardHints(
                problemDetail,
                "error.unsupportedMediaType.hints",
                List.of(
                        "Set the Content-Type header to a supported media type.",
                        "When sending JSON, use 'application/json'.",
                        "Check that the request body matches the declared Content-Type."));
        problemDetail.setProperty(
                "actionRequired", "Change the Content-Type to a supported value.");

        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
                .contentType(PROBLEM_JSON)
                .body(problemDetail);
    }

    /**
     * Handle 406 Not Acceptable errors when error responses cannot match client Accept header.
     *
     * <p>When thrown: When the client sends Accept: application/pdf but the server needs to return
     * a JSON error response (e.g., when an attachment is not found).
     *
     * <p>This handler writes directly to HttpServletResponse to bypass Spring's content negotiation
     * and ensure error responses are always delivered as JSON.
     *
     * @param ex the HttpMediaTypeNotAcceptableException
     * @param request the HTTP servlet request
     * @param response the HTTP servlet response
     */
    @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
    public void handleMediaTypeNotAcceptable(
            HttpMediaTypeNotAcceptableException ex,
            HttpServletRequest request,
            HttpServletResponse response)
            throws IOException {

        log.warn(
                "Media type not acceptable at {}: client accepts {}, server supports {}",
                request.getRequestURI(),
                request.getHeader("Accept"),
                ex.getSupportedMediaTypes());

        // Write JSON error response directly, bypassing content negotiation
        response.setStatus(HttpStatus.NOT_ACCEPTABLE.value());
        response.setContentType("application/problem+json");
        response.setCharacterEncoding("UTF-8");

        // Use ObjectMapper to properly escape JSON values and prevent XSS
        ObjectMapper mapper = new ObjectMapper();
        java.util.Map<String, Object> errorMap = new java.util.LinkedHashMap<>();
        errorMap.put("type", "about:blank");
        errorMap.put("title", "Not Acceptable");
        errorMap.put("status", 406);
        errorMap.put(
                "detail",
                "The requested resource could not be returned in an acceptable format. Error responses are returned as JSON.");
        errorMap.put("instance", request.getRequestURI());
        errorMap.put("timestamp", Instant.now().toString());
        errorMap.put(
                "hints",
                java.util.Arrays.asList(
                        "Error responses are always returned as application/json or application/problem+json",
                        "Set Accept header to include application/json for proper error handling"));

        String errorJson = mapper.writeValueAsString(errorMap);
        response.getWriter().write(errorJson);
        response.getWriter().flush();
    }

    // ===========================================================================================
    // JAVA STANDARD EXCEPTIONS
    // ===========================================================================================

    /**
     * Handle malformed JSON or request body parsing errors.
     *
     * <p>When thrown: When the request body cannot be parsed (invalid JSON, wrong format, etc.).
     *
     * <p>Client action: Check the request body format and ensure it matches the expected structure.
     *
     * @param ex the HttpMessageNotReadableException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 400 BAD_REQUEST
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ProblemDetail> handleMessageNotReadable(
            HttpMessageNotReadableException ex, HttpServletRequest request) {
        log.warn("Malformed request body at {}: {}", request.getRequestURI(), ex.getMessage());

        String message =
                getLocalizedMessage(
                        "error.malformedRequest.detail",
                        "Malformed JSON request or invalid request body format");
        Throwable cause = ex.getCause();
        if (cause != null && cause.getMessage() != null) {
            message =
                    getLocalizedMessage(
                            "error.malformedRequest.detailWithCause",
                            "Invalid request body: " + cause.getMessage(),
                            cause.getMessage());
        }

        String title =
                getLocalizedMessage(
                        "error.malformedRequest.title", ErrorTitles.MALFORMED_REQUEST_DEFAULT);

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.BAD_REQUEST, message, request);
        problemDetail.setType(URI.create(ErrorTypes.MALFORMED_REQUEST));
        problemDetail.setTitle(title);
        problemDetail.setProperty("title", title); // Ensure serialization
        addStandardHints(
                problemDetail,
                "error.malformedRequest.hints",
                List.of(
                        "Validate the JSON or request body format before sending.",
                        "Ensure field names and types match the API contract.",
                        "Remove trailing commas and ensure proper quoting in JSON."));
        problemDetail.setProperty("actionRequired", "Fix the request body format and retry.");

        return ResponseEntity.badRequest().contentType(PROBLEM_JSON).body(problemDetail);
    }

    /**
     * Handle 404 Not Found errors.
     *
     * <p>When thrown: When no handler mapping exists for the requested URL and HTTP method.
     *
     * <p>Client action: Verify the endpoint URL and HTTP method are correct.
     *
     * @param ex the NoHandlerFoundException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 404 NOT_FOUND
     */
    @ExceptionHandler(NoHandlerFoundException.class)
    public ResponseEntity<ProblemDetail> handleNotFound(
            NoHandlerFoundException ex, HttpServletRequest request) {
        log.warn("Endpoint not found: {} {}", ex.getHttpMethod(), ex.getRequestURL());

        String message =
                getLocalizedMessage(
                        "error.notFound.detail",
                        String.format(
                                "No endpoint found for %s %s",
                                ex.getHttpMethod(), ex.getRequestURL()),
                        ex.getHttpMethod(),
                        ex.getRequestURL());

        String title = getLocalizedMessage("error.notFound.title", ErrorTitles.NOT_FOUND_DEFAULT);

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.NOT_FOUND, message, request);
        problemDetail.setType(URI.create(ErrorTypes.NOT_FOUND));
        problemDetail.setTitle(title);
        problemDetail.setProperty("title", title); // Ensure serialization
        problemDetail.setProperty("method", ex.getHttpMethod());
        addStandardHints(
                problemDetail,
                "error.notFound.hints",
                List.of(
                        "Verify the URL path and HTTP method are correct.",
                        "Check the API base path and version if applicable.",
                        "Ensure there are no typos in the endpoint path."));
        problemDetail.setProperty("actionRequired", "Use a valid endpoint URL and method.");

        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .contentType(PROBLEM_JSON)
                .body(problemDetail);
    }

    /**
     * Handle IllegalArgumentException.
     *
     * <p>When thrown: When method receives an illegal or inappropriate argument.
     *
     * <p>Client action: Review the error message and correct the invalid argument in the request.
     *
     * @param ex the IllegalArgumentException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 400 BAD_REQUEST
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ProblemDetail> handleIllegalArgument(
            IllegalArgumentException ex, HttpServletRequest request) {
        log.warn("Invalid argument at {}: {}", request.getRequestURI(), ex.getMessage());

        String title =
                getLocalizedMessage(
                        "error.invalidArgument.title", ErrorTitles.INVALID_ARGUMENT_DEFAULT);

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.BAD_REQUEST, ex.getMessage(), request);
        problemDetail.setType(URI.create(ErrorTypes.INVALID_ARGUMENT));
        problemDetail.setTitle(title);
        problemDetail.setProperty("title", title); // Ensure serialization
        addStandardHints(
                problemDetail,
                "error.invalidArgument.hints",
                List.of(
                        "Review the error message and adjust the parameter value.",
                        "Consult the API docs for accepted ranges and formats.",
                        "Ensure required parameters are present."));
        problemDetail.setProperty("actionRequired", "Correct the invalid argument and retry.");

        return ResponseEntity.badRequest().contentType(PROBLEM_JSON).body(problemDetail);
    }

    /**
     * Handle RuntimeException and check for wrapped BaseAppException or BaseValidationException.
     *
     * <p>This handler unwraps RuntimeExceptions that contain typed exceptions from job execution
     * (AutoJobAspect wraps checked exceptions in RuntimeException) and delegates to the appropriate
     * specific handler.
     *
     * @param ex the RuntimeException
     * @param request the HTTP servlet request
     * @return ProblemDetail with appropriate HTTP status
     */
    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ProblemDetail> handleRuntimeException(
            RuntimeException ex, HttpServletRequest request) {

        // Check if this RuntimeException wraps a typed exception from job execution
        Throwable cause = ex.getCause();
        if (cause instanceof BaseAppException appEx) {
            // Delegate to specific BaseAppException handlers
            if (appEx instanceof PdfPasswordException) {
                return handlePdfPassword((PdfPasswordException) appEx, request);
            } else if (appEx instanceof PdfCorruptedException
                    || appEx instanceof PdfEncryptionException
                    || appEx instanceof OutOfMemoryDpiException) {
                return handlePdfAndDpiExceptions(appEx, request);
            } else if (appEx instanceof GhostscriptException) {
                return handleGhostscriptException((GhostscriptException) appEx, request);
            } else if (appEx instanceof FfmpegRequiredException) {
                return handleFfmpegRequired((FfmpegRequiredException) appEx, request);
            } else {
                return handleBaseApp(appEx, request);
            }
        } else if (cause instanceof BaseValidationException valEx) {
            // Delegate to validation exception handlers
            if (valEx instanceof CbrFormatException
                    || valEx instanceof CbzFormatException
                    || valEx instanceof EmlFormatException) {
                return handleFormatExceptions(valEx, request);
            } else {
                return handleValidation(valEx, request);
            }
        } else if (cause instanceof IOException) {
            // Unwrap and handle IOException (may contain PDF-specific errors)
            return handleIOException((IOException) cause, request);
        } else if (cause instanceof IllegalArgumentException) {
            // Unwrap and handle IllegalArgumentException (business logic validation errors)
            return handleIllegalArgument((IllegalArgumentException) cause, request);
        }

        // Not a wrapped exception - treat as unexpected error
        log.error(
                "Unexpected RuntimeException at {}: {}",
                request.getRequestURI(),
                ex.getMessage(),
                ex);

        String userMessage =
                getLocalizedMessage(
                        "error.unexpected",
                        "An unexpected error occurred. Please try again later.");

        String title =
                getLocalizedMessage("error.unexpected.title", ErrorTitles.UNEXPECTED_DEFAULT);

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.INTERNAL_SERVER_ERROR, userMessage, request);
        problemDetail.setType(URI.create(ErrorTypes.UNEXPECTED));
        problemDetail.setTitle(title);
        problemDetail.setProperty("title", title);

        addStandardHints(
                problemDetail,
                "error.unexpected.hints",
                List.of(
                        "Retry the request after a short delay.",
                        "If the problem persists, contact support with the timestamp and path.",
                        "Check service status or logs for outages."));
        problemDetail.setProperty(
                "actionRequired",
                "Retry later; if persistent, contact support with the error details.");

        if (isDevelopmentMode()) {
            problemDetail.setProperty("debugMessage", ex.getMessage());
            problemDetail.setProperty("exceptionType", ex.getClass().getName());
        }

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .contentType(PROBLEM_JSON)
                .body(problemDetail);
    }

    /**
     * Handle IOException.
     *
     * <p>When thrown: When file I/O operations fail (read, write, corrupt file, etc.).
     *
     * <p>Client action: Verify the file is valid and not corrupted, then retry the request.
     *
     * <p>Note: This handler uses {@link ExceptionUtils#handlePdfException(IOException, String)} to
     * detect and wrap PDF-specific errors (corruption, encryption, password) before processing.
     *
     * @param ex the IOException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 500 INTERNAL_SERVER_ERROR
     */
    @ExceptionHandler(IOException.class)
    public ResponseEntity<ProblemDetail> handleIOException(
            IOException ex, HttpServletRequest request) {

        // Broken pipe / connection reset means the client disconnected.
        // Attempting to write a ProblemDetail response will fail because the
        // response Content-Type may already be committed (e.g. image/png) and
        // the client is gone anyway. Log at WARN and return an empty body.
        if (isClientDisconnectException(ex)) {
            log.warn("Client disconnected at {}: {}", request.getRequestURI(), ex.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }

        // Check if this is a PDF-specific error and wrap it appropriately
        IOException processedException =
                ExceptionUtils.handlePdfException(ex, request.getRequestURI());

        // If it was wrapped as a specific PDF exception, the more specific handler will catch it on
        // retry
        if (processedException instanceof BaseAppException) {
            return handleBaseApp((BaseAppException) processedException, request);
        }

        // Check if this is a NoSuchFileException (temp file was deleted prematurely)
        if (ex instanceof java.nio.file.NoSuchFileException) {
            log.error(
                    "Temporary file not found at {}: {}",
                    request.getRequestURI(),
                    ex.getMessage(),
                    ex);

            String message =
                    getLocalizedMessage(
                            "error.tempFileNotFound.detail",
                            "The temporary file was not found. This may indicate a processing error or cleanup issue. Please try again.");
            String title =
                    getLocalizedMessage("error.tempFileNotFound.title", "Temporary File Not Found");

            ProblemDetail problemDetail =
                    createBaseProblemDetail(HttpStatus.INTERNAL_SERVER_ERROR, message, request);
            problemDetail.setType(URI.create("https://stirlingpdf.com/errors/temp-file-not-found"));
            problemDetail.setTitle(title);
            problemDetail.setProperty("title", title);
            problemDetail.setProperty("errorCode", "E999");
            problemDetail.setProperty(
                    "hint.1",
                    "This error usually occurs when temporary files are cleaned up before processing completes.");
            problemDetail.setProperty("hint.2", "Try submitting your request again.");
            return new ResponseEntity<>(problemDetail, HttpStatus.INTERNAL_SERVER_ERROR);
        }

        log.error("IO error at {}: {}", request.getRequestURI(), ex.getMessage(), ex);

        String message =
                getLocalizedMessage(
                        "error.ioError.detail", "An error occurred while processing the file");
        if (ex.getMessage() != null && !ex.getMessage().isBlank()) {
            message = ex.getMessage();
        }

        String title = getLocalizedMessage("error.ioError.title", ErrorTitles.IO_ERROR_DEFAULT);

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.INTERNAL_SERVER_ERROR, message, request);
        problemDetail.setType(URI.create(ErrorTypes.IO_ERROR));
        problemDetail.setTitle(title);
        problemDetail.setProperty("title", title); // Ensure serialization
        addStandardHints(
                problemDetail,
                "error.ioError.hints",
                List.of(
                        "Confirm the file exists and is accessible.",
                        "Ensure the file is not corrupted and is of a supported type.",
                        "Retry the operation in case of transient I/O issues."));
        problemDetail.setProperty("actionRequired", "Verify the file and try the request again.");

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .contentType(PROBLEM_JSON)
                .body(problemDetail);
    }

    /**
     * Handle generic exceptions as a fallback.
     *
     * <p>When thrown: Any exception not explicitly handled by other handlers.
     *
     * <p>Client action: This indicates an unexpected server error. Retry the request after a delay
     * or contact support if the issue persists.
     *
     * @param ex the Exception
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 500 INTERNAL_SERVER_ERROR
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleGenericException(
            Exception ex, HttpServletRequest request, HttpServletResponse response) {
        log.error("Unexpected error at {}: {}", request.getRequestURI(), ex.getMessage(), ex);

        // If response is already committed (e.g., during streaming), we can't send an error
        // response
        // Log the error and return null to let Spring handle it gracefully
        if (response.isCommitted()) {
            log.warn(
                    "Cannot send error response because response is already committed for URI: {}",
                    request.getRequestURI());
            return null; // Spring will handle gracefully
        }

        String userMessage =
                getLocalizedMessage(
                        "error.unexpected",
                        "An unexpected error occurred. Please try again later.");

        String title =
                getLocalizedMessage("error.unexpected.title", ErrorTitles.UNEXPECTED_DEFAULT);

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.INTERNAL_SERVER_ERROR, userMessage, request);
        problemDetail.setType(URI.create(ErrorTypes.UNEXPECTED));
        problemDetail.setTitle(title);
        problemDetail.setProperty("title", title); // Ensure serialization

        addStandardHints(
                problemDetail,
                "error.unexpected.hints",
                List.of(
                        "Retry the request after a short delay.",
                        "If the problem persists, contact support with the timestamp and path.",
                        "Check service status or logs for outages."));
        problemDetail.setProperty(
                "actionRequired",
                "Retry later; if persistent, contact support with the error details.");

        // Only expose detailed error info in development mode
        if (isDevelopmentMode()) {
            problemDetail.setProperty("debugMessage", ex.getMessage());
            problemDetail.setProperty("exceptionType", ex.getClass().getName());
        }

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .contentType(PROBLEM_JSON)
                .body(problemDetail);
    }

    /**
     * Get a localized message from the MessageSource.
     *
     * <p>Attempts to retrieve a message from the ResourceBundle using the provided key. If the key
     * is not found, returns the default message.
     *
     * @param key the message key in the ResourceBundle
     * @param defaultMessage the default message to use if the key is not found
     * @return the localized message or the default message
     */
    private String getLocalizedMessage(String key, String defaultMessage) {
        return messageSource.getMessage(key, null, defaultMessage, LocaleContextHolder.getLocale());
    }

    /**
     * Get a localized message from the MessageSource with arguments.
     *
     * <p>Attempts to retrieve a message from the ResourceBundle using the provided key and format
     * it with the supplied arguments. If the key is not found, returns the default message.
     *
     * @param key the message key in the ResourceBundle
     * @param defaultMessage the default message to use if the key is not found
     * @param args arguments to format into the message
     * @return the localized message or the default message
     */
    private String getLocalizedMessage(String key, String defaultMessage, Object... args) {
        return messageSource.getMessage(key, args, defaultMessage, LocaleContextHolder.getLocale());
    }

    /**
     * Check if the application is running in development mode.
     *
     * <p>Development mode is identified by checking for "dev" or "development" in active Spring
     * profiles. When enabled, additional debugging information is included in error responses.
     *
     * <p>The result is cached after the first call to avoid repeated array scans.
     *
     * @return true if development mode is active, false otherwise
     */
    private boolean isDevelopmentMode() {
        if (isDevelopmentMode == null) {
            String[] activeProfiles = environment.getActiveProfiles();
            isDevelopmentMode = false;
            for (String profile : activeProfiles) {
                if ("dev".equalsIgnoreCase(profile) || "development".equalsIgnoreCase(profile)) {
                    isDevelopmentMode = true;
                    break;
                }
            }
        }
        return isDevelopmentMode;
    }

    /**
     * Add standard hints to a ProblemDetail from internationalized messages or defaults.
     *
     * @param problemDetail the ProblemDetail to enrich
     * @param hintKey the i18n key for hints (should contain "|" separated hints)
     * @param defaultHints the default hints if i18n key is not found
     */
    private void addStandardHints(
            ProblemDetail problemDetail, String hintKey, List<String> defaultHints) {
        String localizedHints = getLocalizedMessage(hintKey, null);
        if (localizedHints != null) {
            problemDetail.setProperty(
                    "hints",
                    List.of(
                            RegexPatternUtils.getInstance()
                                    .getPipeDelimiterPattern()
                                    .split(localizedHints)));
        } else {
            problemDetail.setProperty("hints", defaultHints);
        }
    }

    /** Constants for error types (RFC 7807 type URIs). */
    private static final class ErrorTypes {
        static final String PDF_PASSWORD = "/errors/pdf-password";
        static final String GHOSTSCRIPT = "/errors/ghostscript";
        static final String FFMPEG_REQUIRED = "/errors/ffmpeg-required";
        static final String OUT_OF_MEMORY_DPI = "/errors/out-of-memory-dpi";
        static final String PDF_CORRUPTED = "/errors/pdf-corrupted";
        static final String PDF_ENCRYPTION = "/errors/pdf-encryption";
        static final String APP_ERROR = "/errors/app-error";
        static final String CBR_FORMAT = "/errors/cbr-format";
        static final String CBZ_FORMAT = "/errors/cbz-format";
        static final String EML_FORMAT = "/errors/eml-format";
        static final String FORMAT_ERROR = "/errors/format-error";
        static final String VALIDATION = "/errors/validation";
        static final String APPLICATION = "/errors/application";
        static final String MISSING_PARAMETER = "/errors/missing-parameter";
        static final String MISSING_FILE = "/errors/missing-file";
        static final String FILE_TOO_LARGE = "/errors/file-too-large";
        static final String METHOD_NOT_ALLOWED = "/errors/method-not-allowed";
        static final String UNSUPPORTED_MEDIA_TYPE = "/errors/unsupported-media-type";
        static final String MALFORMED_REQUEST = "/errors/malformed-request";
        static final String NOT_FOUND = "/errors/not-found";
        static final String INVALID_ARGUMENT = "/errors/invalid-argument";
        static final String IO_ERROR = "/errors/io-error";
        static final String UNEXPECTED = "/errors/unexpected";
    }

    /** Constants for default error titles. */
    private static final class ErrorTitles {
        static final String PDF_PASSWORD_DEFAULT = "PDF Password Required";
        static final String GHOSTSCRIPT_DEFAULT = "Ghostscript Processing Error";
        static final String FFMPEG_REQUIRED_DEFAULT = "FFmpeg Required";
        static final String OUT_OF_MEMORY_DPI_DEFAULT = "Insufficient Memory for Image Rendering";
        static final String PDF_CORRUPTED_DEFAULT = "PDF File Corrupted";
        static final String PDF_ENCRYPTION_DEFAULT = "PDF Encryption Error";
        static final String APPLICATION_DEFAULT = "Application Error";
        static final String CBR_FORMAT_DEFAULT = "Invalid CBR File Format";
        static final String CBZ_FORMAT_DEFAULT = "Invalid CBZ File Format";
        static final String EML_FORMAT_DEFAULT = "Invalid EML File Format";
        static final String FORMAT_ERROR_DEFAULT = "Invalid File Format";
        static final String VALIDATION_DEFAULT = "Validation Error";
        static final String REQUEST_VALIDATION_FAILED_DEFAULT = "Request Validation Failed";
        static final String MISSING_PARAMETER_DEFAULT = "Missing Request Parameter";
        static final String MISSING_FILE_DEFAULT = "Missing File Upload";
        static final String FILE_TOO_LARGE_DEFAULT = "File Too Large";
        static final String METHOD_NOT_ALLOWED_DEFAULT = "HTTP Method Not Allowed";
        static final String UNSUPPORTED_MEDIA_TYPE_DEFAULT = "Unsupported Media Type";
        static final String MALFORMED_REQUEST_DEFAULT = "Malformed Request Body";
        static final String NOT_FOUND_DEFAULT = "Endpoint Not Found";
        static final String INVALID_ARGUMENT_DEFAULT = "Invalid Argument";
        static final String IO_ERROR_DEFAULT = "File Processing Error";
        static final String UNEXPECTED_DEFAULT = "Internal Server Error";
    }
}
