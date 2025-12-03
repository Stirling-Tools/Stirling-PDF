package stirling.software.SPDF.exception;

import java.net.URI;
import java.time.Instant;
import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.util.HtmlUtils;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestControllerAdvice
@RequiredArgsConstructor
@ConditionalOnClass(name = "org.springframework.security.access.AccessDeniedException")
public class SecurityExceptionHandler {

    private static final org.springframework.http.MediaType PROBLEM_JSON =
            org.springframework.http.MediaType.APPLICATION_PROBLEM_JSON;
    private final MessageSource messageSource;

    /**
     * Create a base ProblemDetail with common properties.
     *
     * <p>Sets the status, detail, timestamp, and request path for the problem detail.
     *
     * @param status the HTTP status code
     * @param detail the problem detail message
     * @param request the HTTP servlet request
     * @return a ProblemDetail with timestamp and path properties set
     */
    private static ProblemDetail createBaseProblemDetail(
            HttpStatus status, String detail, HttpServletRequest request) {
        String escapedDetail = detail != null ? HtmlUtils.htmlEscape(detail) : null;
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(status, escapedDetail);
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());
        return problemDetail;
    }

    /**
     * Handle Spring Security access denied exceptions.
     *
     * <p>When thrown: When a user attempts to access a resource they don't have permission to
     * access, typically due to insufficient roles or privileges (e.g., @PreAuthorize annotations).
     *
     * <p>Client action: Ensure you have the necessary permissions or contact an administrator to
     * grant access.
     *
     * @param ex the AccessDeniedException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 403 FORBIDDEN
     */
    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    public ResponseEntity<ProblemDetail> handleAccessDenied(
            org.springframework.security.access.AccessDeniedException ex,
            HttpServletRequest request) {
        log.warn("Access denied to {}", request.getRequestURI());

        String message =
                getLocalizedMessage(
                        "error.accessDenied.detail",
                        "Access to this resource is forbidden. You do not have the required permissions.");

        String title =
                getLocalizedMessage("error.accessDenied.title", ErrorTitles.ACCESS_DENIED_DEFAULT);

        ProblemDetail problemDetail =
                createBaseProblemDetail(HttpStatus.FORBIDDEN, message, request);
        problemDetail.setType(URI.create(ErrorTypes.ACCESS_DENIED));
        problemDetail.setTitle(title);
        problemDetail.setProperty("title", title); // Ensure serialization
        addStandardHints(
                problemDetail,
                "error.accessDenied.hints",
                List.of(
                        "Verify you have the required role or permissions for this operation.",
                        "Contact an administrator if you believe you should have access.",
                        "Check that you are logged in with the correct account."));
        problemDetail.setProperty(
                "actionRequired", "Request appropriate permissions or contact an administrator.");

        return ResponseEntity.status(HttpStatus.FORBIDDEN)
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
     * Add standard hints to a ProblemDetail.
     *
     * <p>Attempts to get localized hints from the message source. If not found, uses default hints.
     *
     * @param problemDetail the problem detail to add hints to
     * @param hintKey the message key for localized hints
     * @param defaultHints the default hints if i18n key is not found
     */
    private void addStandardHints(
            ProblemDetail problemDetail, String hintKey, List<String> defaultHints) {
        String localizedHints = getLocalizedMessage(hintKey, null);
        if (localizedHints != null) {
            // Simple split by pipe for basic i18n support
            problemDetail.setProperty("hints", List.of(localizedHints.split("\\|")));
        } else {
            problemDetail.setProperty("hints", defaultHints);
        }
    }

    /** Constants for error types (RFC 7807 type URIs). */
    private static final class ErrorTypes {
        static final String ACCESS_DENIED = "/errors/access-denied";
    }

    /** Constants for default error titles. */
    private static final class ErrorTitles {
        static final String ACCESS_DENIED_DEFAULT = "Access Denied";
    }
}
