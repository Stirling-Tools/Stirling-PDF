package stirling.software.proprietary.exception;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.time.Instant;
import java.util.List;

/**
 * Handles Spring Security authentication and authorization exceptions in proprietary module. This
 * handler is separate from the core GlobalExceptionHandler because Spring Security dependencies are
 * only available in the proprietary module.
 */
@Slf4j
@RestControllerAdvice
public class SecurityExceptionHandler {

    /**
     * Handle authentication exceptions (thrown by @PreAuthorize and other security checks).
     *
     * @param ex      the AuthenticationException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 401 UNAUTHORIZED
     */
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ProblemDetail> handleAuthenticationException(
        AuthenticationException ex, HttpServletRequest request) {
        log.debug("Authentication failed for {}: {}", request.getRequestURI(), ex.getMessage());

        ProblemDetail problemDetail =
            ProblemDetail.forStatusAndDetail(
                HttpStatus.UNAUTHORIZED, "Authentication required to access this resource");
        problemDetail.setType(URI.create("/errors/authentication-required"));
        problemDetail.setTitle("Authentication Required");
        problemDetail.setInstance(URI.create(request.getRequestURI()));
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());
        problemDetail.setProperty(
            "hints",
            List.of(
                "Ensure you are logged in before accessing this endpoint.",
                "Check that your authentication token is valid and not expired.",
                "For API access, provide a valid API key in the X-API-KEY header."));

        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(problemDetail);
    }

    /**
     * Handle access denied exceptions (thrown by @PreAuthorize for insufficient permissions).
     *
     * @param ex      the AccessDeniedException
     * @param request the HTTP servlet request
     * @return ProblemDetail with HTTP 403 FORBIDDEN
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ProblemDetail> handleAccessDeniedException(
        AccessDeniedException ex, HttpServletRequest request) {
        log.debug("Access denied for {}: {}", request.getRequestURI(), ex.getMessage());

        ProblemDetail problemDetail =
            ProblemDetail.forStatusAndDetail(
                HttpStatus.FORBIDDEN,
                "Access denied: insufficient permissions for this resource");
        problemDetail.setType(URI.create("/errors/access-denied"));
        problemDetail.setTitle("Access Denied");
        problemDetail.setInstance(URI.create(request.getRequestURI()));
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("path", request.getRequestURI());
        problemDetail.setProperty(
            "hints",
            List.of(
                "Ensure you have the required permissions to access this resource.",
                "Contact your system administrator if you believe you should have access.",
                "Check that you are accessing the correct endpoint for your user role."));

        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(problemDetail);
    }
}
