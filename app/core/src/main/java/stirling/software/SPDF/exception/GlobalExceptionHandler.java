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
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.NoHandlerFoundException;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.ExceptionUtils.*;

/**
 * Returns RFC 7807 Problem Details for HTTP APIs, ensuring consistent error responses across the
 * application.
 *
 * <h2>Exception Handler Hierarchy:</h2>
 *
 * <ol>
 *   <li>Application Exceptions (extends BaseAppException)
 *       <ul>
 *         <li>{@link PdfPasswordException} - 401 Unauthorized
 *         <li>{@link OutOfMemoryDpiException} - 507 Insufficient Storage
 *         <li>{@link PdfCorruptedException} - 422 Unprocessable Entity
 *         <li>{@link PdfEncryptionException} - 422 Unprocessable Entity
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
 *     PDDocument doc = PDDocument.load(file);
 * } catch (IOException e) {
 *     throw ExceptionUtils.createPdfCorruptedException("during load", e);
 * }
 * // → GlobalExceptionHandler catches it and returns HTTP 422 with Problem Detail
 *
 * // For validation errors:
 * if (file == null || file.isEmpty()) {
 *     throw ExceptionUtils.createFileNullOrEmptyException();
 * }
 * // → Returns HTTP 400 with error code "E032"
 *
 * // Spring validation automatically handled:
 * public void processFile(@Valid FileRequest request) { ... }
 * // → Returns HTTP 400 with field-level validation errors
 *
 * // File size limits automatically enforced:
 * // → Returns HTTP 413 when upload exceeds spring.servlet.multipart.max-file-size
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
     * @return ProblemDetail with HTTP 401 UNAUTHORIZED
     */
    @ExceptionHandler(PdfPasswordException.class)
    public ResponseEntity<ProblemDetail> handlePdfPassword(
            PdfPasswordException ex, HttpServletRequest request) {
        log.warn(
                "PDF password error at {}: {} ({})",
                request.getRequestURI(),
                ex.getMessage(),
                ex.getErrorCode());

        String title = getLocalizedMessage("error.pdfPassword.title", "PDF Password Required");
        return createProblemDetailResponse(
                ex, HttpStatus.UNAUTHORIZED, "/errors/pdf-password", title, request);
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

        if (ex instanceof OutOfMemoryDpiException) {
            status = HttpStatus.INSUFFICIENT_STORAGE;
            type = "/errors/out-of-memory-dpi";
            title =
                    getLocalizedMessage(
                            "error.outOfMemoryDpi.title",
                            "Insufficient Memory for Image Rendering");
        } else if (ex instanceof PdfCorruptedException) {
            status = HttpStatus.UNPROCESSABLE_ENTITY;
            type = "/errors/pdf-corrupted";
            title = getLocalizedMessage("error.pdfCorrupted.title", "PDF File Corrupted");
        } else if (ex instanceof PdfEncryptionException) {
            status = HttpStatus.UNPROCESSABLE_ENTITY;
            type = "/errors/pdf-encryption";
            title = getLocalizedMessage("error.pdfEncryption.title", "PDF Encryption Error");
        } else {
            status = HttpStatus.UNPROCESSABLE_ENTITY;
            type = "/errors/app-error";
            title = getLocalizedMessage("error.application.title", "Application Error");
        }

        log.error(
                "{} at {}: {} ({})",
                title,
                request.getRequestURI(),
                ex.getMessage(),
                ex.getErrorCode(),
                ex);
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

        if (ex instanceof CbrFormatException) {
            type = "/errors/cbr-format";
            title = getLocalizedMessage("error.cbrFormat.title", "Invalid CBR File Format");
        } else if (ex instanceof CbzFormatException) {
            type = "/errors/cbz-format";
            title = getLocalizedMessage("error.cbzFormat.title", "Invalid CBZ File Format");
        } else if (ex instanceof EmlFormatException) {
            type = "/errors/eml-format";
            title = getLocalizedMessage("error.emlFormat.title", "Invalid EML File Format");
        } else {
            type = "/errors/format-error";
            title = getLocalizedMessage("error.formatError.title", "Invalid File Format");
        }

        log.warn(
                "{} at {}: {} ({})",
                title,
                request.getRequestURI(),
                ex.getMessage(),
                ex.getErrorCode());
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
        log.warn(
                "Validation error at {}: {} ({})",
                request.getRequestURI(),
                ex.getMessage(),
                ex.getErrorCode());
        return createProblemDetailResponse(
                ex, HttpStatus.BAD_REQUEST, "/errors/validation", "Validation Error", request);
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
        log.error(
                "Application error at {}: {} ({})",
                request.getRequestURI(),
                ex.getMessage(),
                ex.getErrorCode(),
                ex);
        return createProblemDetailResponse(
                ex,
                HttpStatus.INTERNAL_SERVER_ERROR,
                "/errors/application",
                "Application Error",
                request);
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

        String title = getLocalizedMessage("error.validation.title", "Request Validation Failed");
        String detail = getLocalizedMessage("error.validation.detail", "Validation failed");

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.BAD_REQUEST, detail, request);
        problemDetail.setType(URI.create("/errors/validation"));
        problemDetail.setTitle(title);
        problemDetail.setProperty("errors", errors);

        return ResponseEntity.badRequest().body(problemDetail);
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
                getLocalizedMessage("error.missingParameter.title", "Missing Request Parameter");

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.BAD_REQUEST, message, request);
        problemDetail.setType(URI.create("/errors/missing-parameter"));
        problemDetail.setTitle(title);
        problemDetail.setProperty("parameterName", ex.getParameterName());
        problemDetail.setProperty("parameterType", ex.getParameterType());

        return ResponseEntity.badRequest().body(problemDetail);
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

        String title = getLocalizedMessage("error.missingFile.title", "Missing File Upload");

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.BAD_REQUEST, message, request);
        problemDetail.setType(URI.create("/errors/missing-file"));
        problemDetail.setTitle(title);
        problemDetail.setProperty("partName", ex.getRequestPartName());

        return ResponseEntity.badRequest().body(problemDetail);
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

        String title = getLocalizedMessage("error.fileTooLarge.title", "File Too Large");

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.PAYLOAD_TOO_LARGE, message, request);
        problemDetail.setType(URI.create("/errors/file-too-large"));
        problemDetail.setTitle(title);
        if (maxSize > 0) {
            problemDetail.setProperty("maxSizeBytes", maxSize);
            problemDetail.setProperty("maxSizeMB", maxSize / (1024 * 1024));
        }

        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(problemDetail);
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
                getLocalizedMessage("error.methodNotAllowed.title", "HTTP Method Not Allowed");

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.METHOD_NOT_ALLOWED, message, request);
        problemDetail.setType(URI.create("/errors/method-not-allowed"));
        problemDetail.setTitle(title);
        problemDetail.setProperty("method", ex.getMethod());
        problemDetail.setProperty("supportedMethods", ex.getSupportedMethods());

        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(problemDetail);
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
                getLocalizedMessage("error.unsupportedMediaType.title", "Unsupported Media Type");

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.UNSUPPORTED_MEDIA_TYPE, message, request);
        problemDetail.setType(URI.create("/errors/unsupported-media-type"));
        problemDetail.setTitle(title);
        problemDetail.setProperty("contentType", String.valueOf(ex.getContentType()));
        problemDetail.setProperty("supportedMediaTypes", ex.getSupportedMediaTypes());

        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE).body(problemDetail);
    }

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
                getLocalizedMessage("error.malformedRequest.title", "Malformed Request Body");

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.BAD_REQUEST, message, request);
        problemDetail.setType(URI.create("/errors/malformed-request"));
        problemDetail.setTitle(title);

        return ResponseEntity.badRequest().body(problemDetail);
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

        String title = getLocalizedMessage("error.notFound.title", "Endpoint Not Found");

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.NOT_FOUND, message, request);
        problemDetail.setType(URI.create("/errors/not-found"));
        problemDetail.setTitle(title);
        problemDetail.setProperty("method", ex.getHttpMethod());

        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(problemDetail);
    }

    // ===========================================================================================
    // JAVA STANDARD EXCEPTIONS
    // ===========================================================================================

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

        String title = getLocalizedMessage("error.invalidArgument.title", "Invalid Argument");

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.BAD_REQUEST, ex.getMessage(), request);
        problemDetail.setType(URI.create("/errors/invalid-argument"));
        problemDetail.setTitle(title);

        return ResponseEntity.badRequest().body(problemDetail);
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

        // Check if this is a PDF-specific error and wrap it appropriately
        IOException processedException =
                ExceptionUtils.handlePdfException(ex, request.getRequestURI());

        // If it was wrapped as a specific PDF exception, the more specific handler will catch it on
        // retry
        if (processedException instanceof BaseAppException) {
            return handleBaseApp((BaseAppException) processedException, request);
        }

        log.error("IO error at {}: {}", request.getRequestURI(), ex.getMessage(), ex);

        String message =
                getLocalizedMessage(
                        "error.ioError.detail", "An error occurred while processing the file");
        if (ex.getMessage() != null && !ex.getMessage().isBlank()) {
            message = ex.getMessage();
        }

        String title = getLocalizedMessage("error.ioError.title", "File Processing Error");

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.INTERNAL_SERVER_ERROR, message, request);
        problemDetail.setType(URI.create("/errors/io-error"));
        problemDetail.setTitle(title);

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(problemDetail);
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
            Exception ex, HttpServletRequest request) {
        log.error("Unexpected error at {}: {}", request.getRequestURI(), ex.getMessage(), ex);

        String userMessage =
                getLocalizedMessage(
                        "error.unexpected",
                        "An unexpected error occurred. Please try again later.");

        String title = getLocalizedMessage("error.unexpected.title", "Internal Server Error");

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.INTERNAL_SERVER_ERROR, userMessage, request);
        problemDetail.setType(URI.create("/errors/unexpected"));
        problemDetail.setTitle(title);

        // Only expose detailed error info in development mode
        if (isDevelopmentMode()) {
            problemDetail.setProperty("debugMessage", ex.getMessage());
            problemDetail.setProperty("exceptionType", ex.getClass().getName());
        }

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(problemDetail);
    }

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
    private ProblemDetail createBaseProblemDetail(
            HttpStatus status, String detail, HttpServletRequest request) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(status, detail);
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());
        return problemDetail;
    }

    /**
     * Helper method to create a standardized ProblemDetail response for exceptions with error
     * codes.
     *
     * <p>This method leverages polymorphism through the {@code getErrorCode()} method available in
     * both {@link BaseAppException} and {@link BaseValidationException}, which are created by
     * {@link ExceptionUtils} factory methods.
     *
     * <p>The error codes follow the format defined in {@link ExceptionUtils.ErrorCode} enum,
     * ensuring consistency across the application.
     *
     * @param ex the exception with error code (BaseAppException or BaseValidationException)
     * @param status the HTTP status
     * @param typeUri the problem type URI
     * @param title the problem title
     * @param request the HTTP servlet request
     * @return ResponseEntity with ProblemDetail including errorCode property
     */
    private ResponseEntity<ProblemDetail> createProblemDetailResponse(
            Object ex,
            HttpStatus status,
            String typeUri,
            String title,
            HttpServletRequest request) {

        String message;
        String errorCode;

        if (ex instanceof BaseAppException appEx) {
            message = appEx.getMessage();
            errorCode = appEx.getErrorCode();
        } else if (ex instanceof BaseValidationException valEx) {
            message = valEx.getMessage();
            errorCode = valEx.getErrorCode();
        } else {
            throw new IllegalArgumentException("Unsupported exception type: " + ex.getClass());
        }

        ProblemDetail problemDetail = createBaseProblemDetail(status, message, request);
        problemDetail.setType(URI.create(typeUri));
        problemDetail.setTitle(title);
        problemDetail.setProperty("errorCode", errorCode);

        return ResponseEntity.status(status).body(problemDetail);
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
     * @return true if development mode is active, false otherwise
     */
    private boolean isDevelopmentMode() {
        String[] activeProfiles = environment.getActiveProfiles();
        for (String profile : activeProfiles) {
            if ("dev".equalsIgnoreCase(profile) || "development".equalsIgnoreCase(profile)) {
                return true;
            }
        }
        return false;
    }
}
