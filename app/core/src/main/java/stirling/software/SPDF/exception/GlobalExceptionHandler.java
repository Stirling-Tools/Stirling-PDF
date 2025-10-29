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

import stirling.software.common.util.ExceptionUtils.*;

@Slf4j
@RestControllerAdvice
@RequiredArgsConstructor
public class GlobalExceptionHandler {

    private final MessageSource messageSource;
    private final Environment environment;

    /**
     * Handle PDF password exceptions.
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
        return createProblemDetailResponse(
                ex,
                HttpStatus.UNAUTHORIZED,
                "/errors/pdf-password",
                "PDF Password Required",
                request);
    }

    /**
     * Handle PDF and DPI-related BaseAppException subtypes.
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
            title = "Insufficient Memory for Image Rendering";
        } else if (ex instanceof PdfCorruptedException) {
            status = HttpStatus.UNPROCESSABLE_ENTITY;
            type = "/errors/pdf-corrupted";
            title = "PDF File Corrupted";
        } else if (ex instanceof PdfEncryptionException) {
            status = HttpStatus.UNPROCESSABLE_ENTITY;
            type = "/errors/pdf-encryption";
            title = "PDF Encryption Error";
        } else {
            status = HttpStatus.UNPROCESSABLE_ENTITY;
            type = "/errors/app-error";
            title = "Application Error";
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
            title = "Invalid CBR File Format";
        } else if (ex instanceof CbzFormatException) {
            type = "/errors/cbz-format";
            title = "Invalid CBZ File Format";
        } else if (ex instanceof EmlFormatException) {
            type = "/errors/eml-format";
            title = "Invalid EML File Format";
        } else {
            type = "/errors/format-error";
            title = "Invalid File Format";
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

        ProblemDetail problemDetail =
                ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed");
        problemDetail.setType(URI.create("/errors/validation"));
        problemDetail.setTitle("Request Validation Failed");
        problemDetail.setProperty("errors", errors);
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());

        return ResponseEntity.badRequest().body(problemDetail);
    }

    /**
     * Handle missing request parameters.
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
                String.format(
                        "Required parameter '%s' of type '%s' is missing",
                        ex.getParameterName(), ex.getParameterType());

        ProblemDetail problemDetail =
                ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, message);
        problemDetail.setType(URI.create("/errors/missing-parameter"));
        problemDetail.setTitle("Missing Request Parameter");
        problemDetail.setProperty("parameterName", ex.getParameterName());
        problemDetail.setProperty("parameterType", ex.getParameterType());
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());

        return ResponseEntity.badRequest().body(problemDetail);
    }

    /**
     * Handle missing multipart file in request.
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
                String.format("Required file part '%s' is missing", ex.getRequestPartName());

        ProblemDetail problemDetail =
                ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, message);
        problemDetail.setType(URI.create("/errors/missing-file"));
        problemDetail.setTitle("Missing File Upload");
        problemDetail.setProperty("partName", ex.getRequestPartName());
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());

        return ResponseEntity.badRequest().body(problemDetail);
    }

    /**
     * Handle file upload size exceeded.
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
                        ? String.format(
                                "File size exceeds maximum allowed limit of %d MB",
                                maxSize / (1024 * 1024))
                        : "File size exceeds maximum allowed limit";

        ProblemDetail problemDetail =
                ProblemDetail.forStatusAndDetail(HttpStatus.PAYLOAD_TOO_LARGE, message);
        problemDetail.setType(URI.create("/errors/file-too-large"));
        problemDetail.setTitle("File Too Large");
        if (maxSize > 0) {
            problemDetail.setProperty("maxSizeBytes", maxSize);
            problemDetail.setProperty("maxSizeMB", maxSize / (1024 * 1024));
        }
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());

        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(problemDetail);
    }

    /**
     * Handle HTTP method not supported.
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
                String.format(
                        "HTTP method '%s' is not supported for this endpoint. Supported methods: %s",
                        ex.getMethod(), String.join(", ", ex.getSupportedMethods()));

        ProblemDetail problemDetail =
                ProblemDetail.forStatusAndDetail(HttpStatus.METHOD_NOT_ALLOWED, message);
        problemDetail.setType(URI.create("/errors/method-not-allowed"));
        problemDetail.setTitle("HTTP Method Not Allowed");
        problemDetail.setProperty("method", ex.getMethod());
        problemDetail.setProperty("supportedMethods", ex.getSupportedMethods());
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());

        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(problemDetail);
    }

    /**
     * Handle unsupported media type.
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
                String.format(
                        "Media type '%s' is not supported. Supported media types: %s",
                        ex.getContentType(), ex.getSupportedMediaTypes());

        ProblemDetail problemDetail =
                ProblemDetail.forStatusAndDetail(HttpStatus.UNSUPPORTED_MEDIA_TYPE, message);
        problemDetail.setType(URI.create("/errors/unsupported-media-type"));
        problemDetail.setTitle("Unsupported Media Type");
        problemDetail.setProperty("contentType", String.valueOf(ex.getContentType()));
        problemDetail.setProperty("supportedMediaTypes", ex.getSupportedMediaTypes());
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());

        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE).body(problemDetail);
    }

    /**
     * Handle malformed JSON or request body parsing errors.
     *
     * @param ex the HttpMessageNotReadableException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 400 BAD_REQUEST
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ProblemDetail> handleMessageNotReadable(
            HttpMessageNotReadableException ex, HttpServletRequest request) {
        log.warn("Malformed request body at {}: {}", request.getRequestURI(), ex.getMessage());

        String message = "Malformed JSON request or invalid request body format";
        Throwable cause = ex.getCause();
        if (cause != null && cause.getMessage() != null) {
            message = "Invalid request body: " + cause.getMessage();
        }

        ProblemDetail problemDetail =
                ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, message);
        problemDetail.setType(URI.create("/errors/malformed-request"));
        problemDetail.setTitle("Malformed Request Body");
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());

        return ResponseEntity.badRequest().body(problemDetail);
    }

    /**
     * Handle 404 Not Found errors.
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
                String.format(
                        "No endpoint found for %s %s", ex.getHttpMethod(), ex.getRequestURL());

        ProblemDetail problemDetail =
                ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, message);
        problemDetail.setType(URI.create("/errors/not-found"));
        problemDetail.setTitle("Endpoint Not Found");
        problemDetail.setProperty("method", ex.getHttpMethod());
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());

        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(problemDetail);
    }

    /**
     * Handle IllegalArgumentException.
     *
     * @param ex the IllegalArgumentException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 400 BAD_REQUEST
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ProblemDetail> handleIllegalArgument(
            IllegalArgumentException ex, HttpServletRequest request) {
        log.warn("Invalid argument at {}: {}", request.getRequestURI(), ex.getMessage());

        ProblemDetail problemDetail =
                ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
        problemDetail.setType(URI.create("/errors/invalid-argument"));
        problemDetail.setTitle("Invalid Argument");
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());

        return ResponseEntity.badRequest().body(problemDetail);
    }

    /**
     * Handle IOException.
     *
     * @param ex the IOException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 500 INTERNAL_SERVER_ERROR
     */
    @ExceptionHandler(IOException.class)
    public ResponseEntity<ProblemDetail> handleIOException(
            IOException ex, HttpServletRequest request) {
        log.error("IO error at {}: {}", request.getRequestURI(), ex.getMessage(), ex);

        String message = "An error occurred while processing the file";
        if (ex.getMessage() != null && !ex.getMessage().isBlank()) {
            message = ex.getMessage();
        }

        ProblemDetail problemDetail =
                ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, message);
        problemDetail.setType(URI.create("/errors/io-error"));
        problemDetail.setTitle("File Processing Error");
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(problemDetail);
    }

    /**
     * Handle generic exceptions as a fallback.
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
                messageSource.getMessage(
                        "error.unexpected",
                        null,
                        "An unexpected error occurred. Please try again later.",
                        LocaleContextHolder.getLocale());

        ProblemDetail problemDetail =
                ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, userMessage);
        problemDetail.setType(URI.create("/errors/unexpected"));
        problemDetail.setTitle("Internal Server Error");
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());

        // Only expose detailed error info in development mode
        if (isDevelopmentMode()) {
            problemDetail.setProperty("debugMessage", ex.getMessage());
            problemDetail.setProperty("exceptionType", ex.getClass().getName());
        }

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(problemDetail);
    }

    /**
     * Helper method to create a standardized ProblemDetail response for exceptions with error
     * codes.
     *
     * @param ex the exception with error code
     * @param status the HTTP status
     * @param typeUri the problem type URI
     * @param title the problem title
     * @param request the HTTP servlet request
     * @return ResponseEntity with ProblemDetail
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

        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(status, message);
        problemDetail.setType(URI.create(typeUri));
        problemDetail.setTitle(title);
        problemDetail.setProperty("errorCode", errorCode);
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());

        return ResponseEntity.status(status).body(problemDetail);
    }

    /**
     * Check if the application is running in development mode.
     *
     * @return true if development mode is active
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
