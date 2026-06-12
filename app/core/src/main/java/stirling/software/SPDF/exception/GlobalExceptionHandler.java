package stirling.software.SPDF.exception;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.ResourceBundle;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.ExceptionUtils.*;
import stirling.software.common.util.RegexPatternUtils;

import tools.jackson.databind.ObjectMapper;

/**
 * Returns RFC 7807 Problem Details for HTTP APIs, ensuring consistent error responses across the
 * application.
 *
 * <p>Migrated from a Spring {@code @RestControllerAdvice} to a JAX-RS
 * {@link jakarta.ws.rs.ext.ExceptionMapper}. Because JAX-RS resolves at most one mapper per
 * exception type, this single {@code ExceptionMapper<Throwable>} reproduces the original per-type
 * {@code @ExceptionHandler} dispatch by inspecting the thrown exception with {@code instanceof}.
 * The RFC 7807 body, previously a Spring {@code ProblemDetail}, is now built as an ordered
 * {@link java.util.Map} (serialized by quarkus-rest-jackson) to preserve the exact response shape
 * without depending on Spring types.
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
 *   <li>Java Standard Exceptions
 *       <ul>
 *         <li>{@link IllegalArgumentException} - 400 Bad Request
 *         <li>{@link IOException} - 500 Internal Server Error
 *         <li>{@link Exception} - 500 Internal Server Error (catch-all)
 *       </ul>
 * </ol>
 *
 * <p>TODO: Migration required - the Spring-MVC-specific framework exceptions that used to be handled
 * here are never thrown under Quarkus/RESTEasy Reactive and their types cannot be referenced
 * without Spring on the classpath. A collaborator should add JAX-RS equivalents (likely as separate
 * {@code @Provider ExceptionMapper}s or additional {@code instanceof} branches once the Quarkus
 * exception types are confirmed):
 *
 * <ul>
 *   <li>{@code MethodArgumentNotValidException} -> {@code jakarta.validation.ConstraintViolationException}
 *       (400, build the {@code errors} list from {@code getConstraintViolations()})
 *   <li>{@code MissingServletRequestParameterException} / {@code MissingServletRequestPartException}
 *       -> RESTEasy missing {@code @QueryParam}/{@code @RestForm} handling (400)
 *   <li>{@code MaxUploadSizeExceededException} -> quarkus.http.limits.max-body-size rejection (413)
 *   <li>{@code HttpRequestMethodNotSupportedException} -> {@code jakarta.ws.rs.NotAllowedException} (405)
 *   <li>{@code HttpMediaTypeNotSupportedException} -> {@code jakarta.ws.rs.NotSupportedException} (415)
 *   <li>{@code HttpMediaTypeNotAcceptableException} -> {@code jakarta.ws.rs.NotAcceptableException} (406)
 *   <li>{@code HttpMessageNotReadableException} -> JSON deserialization failure (400)
 *   <li>{@code NoHandlerFoundException} / {@code NoResourceFoundException} ->
 *       {@code jakarta.ws.rs.NotFoundException} (404)
 *   <li>{@code ResponseStatusException} -> {@code jakarta.ws.rs.WebApplicationException}
 *       (carry through {@code getResponse().getStatus()})
 * </ul>
 *
 * <p>Their full body-building logic is preserved below in private {@code build*} helper methods so
 * the collaborator can reuse it once the JAX-RS exception types are wired in.
 *
 * @see <a href="https://datatracker.ietf.org/doc/html/rfc7807">RFC 7807: Problem Details for HTTP
 *     APIs</a>
 * @see ExceptionUtils
 */
@Slf4j
@Provider
@ApplicationScoped
public class GlobalExceptionHandler implements ExceptionMapper<Throwable> {

    private static final String PROBLEM_JSON = "application/problem+json";

    // TODO: Migration required - the per-request locale used to come from Spring's
    // LocaleContextHolder (populated by the MVC LocaleChangeInterceptor). Until the equivalent
    // ContainerRequestFilter described in LocaleConfiguration is in place, fall back to the JVM
    // default locale. Localized messages are read from the shared messages.properties bundle (the
    // same bundle ExceptionUtils uses) instead of a Spring MessageSource bean, which no longer
    // exists under Quarkus.
    private static final String MESSAGES_BUNDLE = "messages";

    // TODO: Migration required - development mode used to be derived from Spring active profiles via
    // org.springframework.core.env.Environment. Quarkus exposes the profile through
    // io.quarkus.runtime.LaunchMode / quarkus.profile; this is read here from the standard config so
    // no Spring Environment is needed.
    private Boolean isDevelopmentMode;

    @Context HttpServletRequest request;

    @Override
    public Response toResponse(Throwable exception) {
        HttpServletRequest req = request;

        if (exception instanceof PdfPasswordException ex) {
            return handlePdfPassword(ex, req);
        }
        if (exception instanceof GhostscriptException ex) {
            return handleGhostscriptException(ex, req);
        }
        if (exception instanceof FfmpegRequiredException ex) {
            return handleFfmpegRequired(ex, req);
        }
        if (exception instanceof PdfCorruptedException
                || exception instanceof PdfEncryptionException
                || exception instanceof OutOfMemoryDpiException) {
            return handlePdfAndDpiExceptions((BaseAppException) exception, req);
        }
        if (exception instanceof CbrFormatException
                || exception instanceof CbzFormatException
                || exception instanceof EmlFormatException) {
            return handleFormatExceptions((BaseValidationException) exception, req);
        }
        if (exception instanceof BaseValidationException ex) {
            return handleValidation(ex, req);
        }
        if (exception instanceof BaseAppException ex) {
            return handleBaseApp(ex, req);
        }
        if (exception instanceof IllegalArgumentException ex) {
            return handleIllegalArgument(ex, req);
        }
        if (exception instanceof IOException ex) {
            return handleIOException(ex, req);
        }
        if (exception instanceof RuntimeException ex) {
            return handleRuntimeException(ex, req);
        }
        if (exception instanceof Exception ex) {
            return handleGenericException(ex, req);
        }
        // Throwable (Error etc.) - treat as unexpected.
        return handleGenericException(new Exception(exception), req);
    }

    /**
     * Create a base RFC 7807 problem map with common properties (status, detail, timestamp, path).
     *
     * @param status the HTTP status code
     * @param detail the problem detail message
     * @param request the HTTP servlet request
     * @return a mutable, ordered map with status/detail/timestamp/path set
     */
    private static Map<String, Object> createBaseProblemDetail(
            Response.Status status, String detail, HttpServletRequest request) {
        Map<String, Object> problemDetail = new LinkedHashMap<>();
        problemDetail.put("status", status.getStatusCode());
        problemDetail.put("detail", detail);
        problemDetail.put("timestamp", java.time.Instant.now());
        problemDetail.put("path", request.getRequestURI());
        return problemDetail;
    }

    /**
     * Checks whether the given IOException indicates that the client disconnected before the
     * response could be written (broken pipe, connection reset, etc.). When this happens there is
     * no point in serialising a problem body because the socket is already closed - and attempting
     * to do so may trigger a secondary write error if the response Content-Type was already
     * committed as a non-JSON type (e.g. image/png).
     */
    private static boolean isClientDisconnectException(IOException ex) {
        // Walk the causal chain - the server may wrap the low-level SocketException
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
     * Helper method to create a standardized problem response for exceptions with error codes.
     *
     * <p>This method uses the {@link ExceptionUtils.ErrorCodeProvider} interface for type-safe
     * polymorphic handling of both {@link BaseAppException} and {@link BaseValidationException},
     * which are created by {@link ExceptionUtils} factory methods.
     *
     * @param ex the exception implementing ErrorCodeProvider interface
     * @param status the HTTP status
     * @param typeUri the problem type URI
     * @param title the problem title
     * @param request the HTTP servlet request
     * @return a Response with a problem+json body including errorCode property
     */
    private static Response createProblemDetailResponse(
            ExceptionUtils.ErrorCodeProvider ex,
            Response.Status status,
            String typeUri,
            String title,
            HttpServletRequest request) {

        Map<String, Object> problemDetail =
                createBaseProblemDetail(status, ex.getMessage(), request);
        problemDetail.put("type", typeUri);
        problemDetail.put("title", title);
        problemDetail.put("errorCode", ex.getErrorCode());

        // Attach hints and actionRequired from centralized registry (single call)
        enrichWithErrorMetadata(problemDetail, ex.getErrorCode());

        return Response.status(status).type(PROBLEM_JSON).entity(problemDetail).build();
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
     * Enrich the problem map with error metadata (hints and action required) from error code
     * registry.
     *
     * @param problemDetail the problem map to enrich
     * @param errorCode the error code to look up
     */
    private static void enrichWithErrorMetadata(
            Map<String, Object> problemDetail, String errorCode) {
        List<String> hints = ExceptionUtils.getHintsForErrorCode(errorCode);
        if (!hints.isEmpty()) {
            problemDetail.put("hints", hints);
        }

        String actionRequired = ExceptionUtils.getActionRequiredForErrorCode(errorCode);
        if (actionRequired != null && !actionRequired.isBlank()) {
            problemDetail.put("actionRequired", actionRequired);
        }
    }

    /**
     * Handle PDF password exceptions.
     *
     * @param ex the PdfPasswordException
     * @param request the HTTP servlet request
     * @return Response with HTTP 400 BAD_REQUEST
     */
    public Response handlePdfPassword(PdfPasswordException ex, HttpServletRequest request) {
        logException("warn", "PDF password", request, ex, ex.getErrorCode());

        String title =
                getLocalizedMessage("error.pdfPassword.title", ErrorTitles.PDF_PASSWORD_DEFAULT);
        return createProblemDetailResponse(
                ex, Response.Status.BAD_REQUEST, ErrorTypes.PDF_PASSWORD, title, request);
    }

    /**
     * Handle Ghostscript processing exceptions originating from external binaries.
     *
     * @param ex the GhostscriptException
     * @param request the HTTP servlet request
     * @return Response with HTTP 500 INTERNAL_SERVER_ERROR (external process failure)
     */
    public Response handleGhostscriptException(
            GhostscriptException ex, HttpServletRequest request) {
        logException("warn", "Ghostscript", request, ex, ex.getErrorCode());

        String title =
                getLocalizedMessage(
                        "error.ghostscriptCompression.title", ErrorTitles.GHOSTSCRIPT_DEFAULT);
        return createProblemDetailResponse(
                ex,
                Response.Status.INTERNAL_SERVER_ERROR,
                ErrorTypes.GHOSTSCRIPT,
                title,
                request);
    }

    /**
     * Handle FFmpeg dependency missing errors when media conversion endpoints are invoked.
     *
     * @param ex the FfmpegRequiredException
     * @param request the HTTP servlet request
     * @return Response with HTTP 503 SERVICE_UNAVAILABLE
     */
    public Response handleFfmpegRequired(FfmpegRequiredException ex, HttpServletRequest request) {
        logException("warn", "FFmpeg unavailable", request, ex, ex.getErrorCode());

        String title =
                getLocalizedMessage(
                        "error.ffmpegRequired.title", ErrorTitles.FFMPEG_REQUIRED_DEFAULT);
        return createProblemDetailResponse(
                ex,
                Response.Status.SERVICE_UNAVAILABLE,
                ErrorTypes.FFMPEG_REQUIRED,
                title,
                request);
    }

    /**
     * Handle PDF and DPI-related BaseAppException subtypes.
     *
     * @param ex the BaseAppException
     * @param request the HTTP servlet request
     * @return Response with appropriate HTTP status
     */
    public Response handlePdfAndDpiExceptions(BaseAppException ex, HttpServletRequest request) {

        Response.Status status;
        String type;
        String title;
        String category;

        if (ex instanceof OutOfMemoryDpiException) {
            // Use BAD_REQUEST for better client compatibility (was 422/507)
            status = Response.Status.BAD_REQUEST;
            type = ErrorTypes.OUT_OF_MEMORY_DPI;
            title =
                    getLocalizedMessage(
                            "error.outOfMemoryDpi.title", ErrorTitles.OUT_OF_MEMORY_DPI_DEFAULT);
            category = "Out of Memory DPI";
        } else if (ex instanceof PdfCorruptedException) {
            // Use BAD_REQUEST for better client compatibility (was 422)
            status = Response.Status.BAD_REQUEST;
            type = ErrorTypes.PDF_CORRUPTED;
            title =
                    getLocalizedMessage(
                            "error.pdfCorrupted.title", ErrorTitles.PDF_CORRUPTED_DEFAULT);
            category = "PDF Corrupted";
        } else if (ex instanceof PdfEncryptionException) {
            // Use BAD_REQUEST for better client compatibility (was 422)
            status = Response.Status.BAD_REQUEST;
            type = ErrorTypes.PDF_ENCRYPTION;
            title =
                    getLocalizedMessage(
                            "error.pdfEncryption.title", ErrorTitles.PDF_ENCRYPTION_DEFAULT);
            category = "PDF Encryption";
        } else {
            status = Response.Status.BAD_REQUEST;
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
     * @param ex the format exception
     * @param request the HTTP servlet request
     * @return Response with HTTP 400 BAD_REQUEST
     */
    public Response handleFormatExceptions(
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
        return createProblemDetailResponse(ex, Response.Status.BAD_REQUEST, type, title, request);
    }

    /**
     * Handle generic validation exceptions.
     *
     * @param ex the BaseValidationException
     * @param request the HTTP servlet request
     * @return Response with HTTP 400 BAD_REQUEST
     */
    public Response handleValidation(BaseValidationException ex, HttpServletRequest request) {
        logException("warn", "Validation", request, ex, ex.getErrorCode());
        String title =
                getLocalizedMessage("error.validation.title", ErrorTitles.VALIDATION_DEFAULT);
        return createProblemDetailResponse(
                ex, Response.Status.BAD_REQUEST, ErrorTypes.VALIDATION, title, request);
    }

    /**
     * Handle all BaseAppException subtypes not handled by specific handlers.
     *
     * @param ex the BaseAppException
     * @param request the HTTP servlet request
     * @return Response with HTTP 500 INTERNAL_SERVER_ERROR
     */
    public Response handleBaseApp(BaseAppException ex, HttpServletRequest request) {
        logException("error", "Application", request, ex, ex.getErrorCode());
        String title =
                getLocalizedMessage("error.application.title", ErrorTitles.APPLICATION_DEFAULT);
        return createProblemDetailResponse(
                ex,
                Response.Status.INTERNAL_SERVER_ERROR,
                ErrorTypes.APPLICATION,
                title,
                request);
    }

    // ===========================================================================================
    // 406 NOT ACCEPTABLE - direct write
    // ===========================================================================================

    /**
     * Build the JSON body previously written directly to the servlet response when the client's
     * Accept header could not be satisfied (Spring's {@code HttpMediaTypeNotAcceptableException}).
     *
     * <p>TODO: Migration required - this path was triggered by Spring MVC content negotiation. Under
     * Quarkus/JAX-RS the equivalent is {@code jakarta.ws.rs.NotAcceptableException}; a collaborator
     * should register a mapper that returns this body with status 406 and Content-Type
     * application/problem+json. The body-building logic is preserved here for reuse.
     */
    private String buildNotAcceptableJson(HttpServletRequest request) {
        // Use ObjectMapper to properly escape JSON values and prevent XSS
        ObjectMapper mapper = new ObjectMapper();
        Map<String, Object> errorMap = new LinkedHashMap<>();
        errorMap.put("type", "about:blank");
        errorMap.put("title", "Not Acceptable");
        errorMap.put("status", 406);
        errorMap.put(
                "detail",
                "The requested resource could not be returned in an acceptable format. Error responses are returned as JSON.");
        errorMap.put("instance", request.getRequestURI());
        errorMap.put("timestamp", java.time.Instant.now().toString());
        errorMap.put(
                "hints",
                java.util.Arrays.asList(
                        "Error responses are always returned as application/json or application/problem+json",
                        "Set Accept header to include application/json for proper error handling"));
        return mapper.writeValueAsString(errorMap);
    }

    // ===========================================================================================
    // JAVA STANDARD EXCEPTIONS
    // ===========================================================================================

    /**
     * Handle IllegalArgumentException.
     *
     * @param ex the IllegalArgumentException
     * @param request the HTTP servlet request
     * @return Response with HTTP 400 BAD_REQUEST
     */
    public Response handleIllegalArgument(IllegalArgumentException ex, HttpServletRequest request) {
        log.warn("Invalid argument at {}: {}", request.getRequestURI(), ex.getMessage());

        String title =
                getLocalizedMessage(
                        "error.invalidArgument.title", ErrorTitles.INVALID_ARGUMENT_DEFAULT);

        Map<String, Object> problemDetail =
                createBaseProblemDetail(Response.Status.BAD_REQUEST, ex.getMessage(), request);
        problemDetail.put("type", ErrorTypes.INVALID_ARGUMENT);
        problemDetail.put("title", title);
        addStandardHints(
                problemDetail,
                "error.invalidArgument.hints",
                List.of(
                        "Review the error message and adjust the parameter value.",
                        "Consult the API docs for accepted ranges and formats.",
                        "Ensure required parameters are present."));
        problemDetail.put("actionRequired", "Correct the invalid argument and retry.");

        return Response.status(Response.Status.BAD_REQUEST)
                .type(PROBLEM_JSON)
                .entity(problemDetail)
                .build();
    }

    /**
     * Handle RuntimeException and check for wrapped BaseAppException or BaseValidationException.
     *
     * <p>This handler unwraps RuntimeExceptions that contain typed exceptions from job execution
     * (AutoJobAspect wraps checked exceptions in RuntimeException) and delegates to the appropriate
     * specific handler.
     *
     * <p>Note: Spring's {@code ResponseStatusException} branch was removed here; see the class-level
     * TODO for its JAX-RS equivalent ({@code jakarta.ws.rs.WebApplicationException}).
     *
     * @param ex the RuntimeException
     * @param request the HTTP servlet request
     * @return Response with appropriate HTTP status
     */
    public Response handleRuntimeException(RuntimeException ex, HttpServletRequest request) {

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

        Map<String, Object> problemDetail =
                createBaseProblemDetail(
                        Response.Status.INTERNAL_SERVER_ERROR, userMessage, request);
        problemDetail.put("type", ErrorTypes.UNEXPECTED);
        problemDetail.put("title", title);

        addStandardHints(
                problemDetail,
                "error.unexpected.hints",
                List.of(
                        "Retry the request after a short delay.",
                        "If the problem persists, contact support with the timestamp and path.",
                        "Check service status or logs for outages."));
        problemDetail.put(
                "actionRequired",
                "Retry later; if persistent, contact support with the error details.");

        if (isDevelopmentMode()) {
            problemDetail.put("debugMessage", ex.getMessage());
            problemDetail.put("exceptionType", ex.getClass().getName());
        }

        return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .type(PROBLEM_JSON)
                .entity(problemDetail)
                .build();
    }

    /**
     * Handle IOException.
     *
     * <p>Note: This handler uses {@link ExceptionUtils#handlePdfException(IOException, String)} to
     * detect and wrap PDF-specific errors (corruption, encryption, password) before processing.
     *
     * @param ex the IOException
     * @param request the HTTP servlet request
     * @return Response with HTTP 500 INTERNAL_SERVER_ERROR
     */
    public Response handleIOException(IOException ex, HttpServletRequest request) {

        // Broken pipe / connection reset means the client disconnected.
        // Attempting to write a problem response will fail because the
        // response Content-Type may already be committed (e.g. image/png) and
        // the client is gone anyway. Log at WARN and return an empty body.
        if (isClientDisconnectException(ex)) {
            log.warn("Client disconnected at {}: {}", request.getRequestURI(), ex.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).build();
        }

        // Check if this is a PDF-specific error and wrap it appropriately
        IOException processedException =
                ExceptionUtils.handlePdfException(ex, request.getRequestURI());

        // If it was wrapped as a specific PDF exception, dispatch to the BaseApp handler.
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

            Map<String, Object> problemDetail =
                    createBaseProblemDetail(
                            Response.Status.INTERNAL_SERVER_ERROR, message, request);
            problemDetail.put("type", "https://stirlingpdf.com/errors/temp-file-not-found");
            problemDetail.put("title", title);
            problemDetail.put("errorCode", "E999");
            problemDetail.put(
                    "hint.1",
                    "This error usually occurs when temporary files are cleaned up before processing completes.");
            problemDetail.put("hint.2", "Try submitting your request again.");
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .type(PROBLEM_JSON)
                    .entity(problemDetail)
                    .build();
        }

        log.error("IO error at {}: {}", request.getRequestURI(), ex.getMessage(), ex);

        String message =
                getLocalizedMessage(
                        "error.ioError.detail", "An error occurred while processing the file");
        if (ex.getMessage() != null && !ex.getMessage().isBlank()) {
            message = ex.getMessage();
        }

        String title = getLocalizedMessage("error.ioError.title", ErrorTitles.IO_ERROR_DEFAULT);

        Map<String, Object> problemDetail =
                createBaseProblemDetail(Response.Status.INTERNAL_SERVER_ERROR, message, request);
        problemDetail.put("type", ErrorTypes.IO_ERROR);
        problemDetail.put("title", title);
        addStandardHints(
                problemDetail,
                "error.ioError.hints",
                List.of(
                        "Confirm the file exists and is accessible.",
                        "Ensure the file is not corrupted and is of a supported type.",
                        "Retry the operation in case of transient I/O issues."));
        problemDetail.put("actionRequired", "Verify the file and try the request again.");

        return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .type(PROBLEM_JSON)
                .entity(problemDetail)
                .build();
    }

    /**
     * Handle generic exceptions as a fallback.
     *
     * @param ex the Exception
     * @param request the HTTP servlet request
     * @return Response with HTTP 500 INTERNAL_SERVER_ERROR
     */
    public Response handleGenericException(Exception ex, HttpServletRequest request) {
        log.error("Unexpected error at {}: {}", request.getRequestURI(), ex.getMessage(), ex);

        // TODO: Migration required - the original Spring handler checked
        // HttpServletResponse.isCommitted() and returned null to let Spring write nothing when the
        // response was already committed (e.g. during streaming). JAX-RS ExceptionMapper has no
        // direct access to commit state; returning a Response here is the closest equivalent. If
        // streaming endpoints need the old "do nothing when committed" behavior, a collaborator
        // should detect that condition (e.g. via a ContainerResponseFilter) and short-circuit.

        String userMessage =
                getLocalizedMessage(
                        "error.unexpected",
                        "An unexpected error occurred. Please try again later.");

        String title =
                getLocalizedMessage("error.unexpected.title", ErrorTitles.UNEXPECTED_DEFAULT);

        Map<String, Object> problemDetail =
                createBaseProblemDetail(
                        Response.Status.INTERNAL_SERVER_ERROR, userMessage, request);
        problemDetail.put("type", ErrorTypes.UNEXPECTED);
        problemDetail.put("title", title);

        addStandardHints(
                problemDetail,
                "error.unexpected.hints",
                List.of(
                        "Retry the request after a short delay.",
                        "If the problem persists, contact support with the timestamp and path.",
                        "Check service status or logs for outages."));
        problemDetail.put(
                "actionRequired",
                "Retry later; if persistent, contact support with the error details.");

        // Only expose detailed error info in development mode
        if (isDevelopmentMode()) {
            problemDetail.put("debugMessage", ex.getMessage());
            problemDetail.put("exceptionType", ex.getClass().getName());
        }

        return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .type(PROBLEM_JSON)
                .entity(problemDetail)
                .build();
    }

    /**
     * Get a localized message from the shared messages.properties ResourceBundle.
     *
     * <p>Replaces the former Spring {@code MessageSource} lookup. Reads from the same bundle that
     * {@link ExceptionUtils} uses, so error wording stays consistent.
     *
     * @param key the message key in the ResourceBundle
     * @param defaultMessage the default message to use if the key is not found
     * @return the localized message or the default message
     */
    private String getLocalizedMessage(String key, String defaultMessage) {
        return getLocalizedMessage(key, defaultMessage, (Object[]) null);
    }

    /**
     * Get a localized message from the shared messages.properties ResourceBundle with arguments.
     *
     * @param key the message key in the ResourceBundle
     * @param defaultMessage the default message to use if the key is not found
     * @param args arguments to format into the message ({@code {0}}, {@code {1}} placeholders)
     * @return the localized message or the default message
     */
    private String getLocalizedMessage(String key, String defaultMessage, Object... args) {
        // TODO: Migration required - locale is the JVM default until the per-request locale
        // ContainerRequestFilter described in LocaleConfiguration replaces Spring's
        // LocaleContextHolder.getLocale().
        String template = defaultMessage;
        try {
            ResourceBundle bundle =
                    ResourceBundle.getBundle(MESSAGES_BUNDLE, Locale.getDefault());
            if (bundle.containsKey(key)) {
                template = bundle.getString(key);
            }
        } catch (java.util.MissingResourceException ignored) {
            // Fall back to the default message below.
        }
        if (template == null) {
            return null;
        }
        return (args != null && args.length > 0)
                ? java.text.MessageFormat.format(template, args)
                : template;
    }

    /**
     * Check if the application is running in development mode.
     *
     * <p>The result is cached after the first call.
     *
     * @return true if development mode is active, false otherwise
     */
    private boolean isDevelopmentMode() {
        if (isDevelopmentMode == null) {
            // TODO: Migration required - this replaces Spring's Environment.getActiveProfiles()
            // ("dev"/"development") check. Quarkus exposes the active profile via
            // io.quarkus.runtime.LaunchMode and the "quarkus.profile" config key; read it from the
            // standard config so no Spring Environment bean is required.
            String profile =
                    org.eclipse.microprofile.config.ConfigProvider.getConfig()
                            .getOptionalValue("quarkus.profile", String.class)
                            .orElse(System.getProperty("quarkus.profile", ""));
            isDevelopmentMode =
                    "dev".equalsIgnoreCase(profile) || "development".equalsIgnoreCase(profile);
        }
        return isDevelopmentMode;
    }

    /**
     * Add standard hints to a problem map from internationalized messages or defaults.
     *
     * @param problemDetail the problem map to enrich
     * @param hintKey the i18n key for hints (should contain "|" separated hints)
     * @param defaultHints the default hints if i18n key is not found
     */
    private void addStandardHints(
            Map<String, Object> problemDetail, String hintKey, List<String> defaultHints) {
        String localizedHints = getLocalizedMessage(hintKey, null);
        if (localizedHints != null) {
            problemDetail.put(
                    "hints",
                    List.of(
                            RegexPatternUtils.getInstance()
                                    .getPipeDelimiterPattern()
                                    .split(localizedHints)));
        } else {
            problemDetail.put("hints", defaultHints);
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
