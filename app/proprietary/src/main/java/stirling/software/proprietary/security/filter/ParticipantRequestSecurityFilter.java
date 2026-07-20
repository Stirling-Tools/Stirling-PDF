package stirling.software.proprietary.security.filter;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

/** Protects workflow participant endpoints before multipart requests are parsed. */
@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ParticipantRequestSecurityFilter extends OncePerRequestFilter {

    static final long MAX_MULTIPART_REQUEST_SIZE_BYTES = 16L * 1024 * 1024;

    private static final String PARTICIPANT_PATH = "/api/v1/workflow/participant/";
    private static final String AUTHENTICATED_CERTIFICATE_VALIDATION_PATH =
            "/api/v1/security/cert-sign/validate-certificate";
    private static final Pattern AUTHENTICATED_SIGN_PATH =
            Pattern.compile("^/api/v1/security/cert-sign/sign-requests/[^/]+/sign$");
    private static final Set<String> MULTIPART_UPLOAD_PATHS =
            Set.of(
                    PARTICIPANT_PATH + "submit-signature",
                    PARTICIPANT_PATH + "validate-certificate",
                    AUTHENTICATED_CERTIFICATE_VALIDATION_PATH);
    private static final int MAX_REQUESTS_PER_MINUTE = 20;
    private static final long WINDOW_MS = 60_000L;

    private final ConcurrentHashMap<String, RequestWindow> requestCounts =
            new ConcurrentHashMap<>();

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = normalizedRequestPath(request);
        return !path.startsWith(PARTICIPANT_PATH) && !isAuthenticatedWorkflowUploadPath(path);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (rateLimitExceeded(request)) {
            log.warn(
                    "Rate limit exceeded for IP {} on participant endpoint {}",
                    request.getRemoteAddr(),
                    request.getRequestURI());
            writeError(
                    response,
                    HttpStatus.TOO_MANY_REQUESTS,
                    "Rate limit exceeded. Try again in 60 seconds.");
            response.setHeader("Retry-After", "60");
            return;
        }

        if (isMultipartUploadEndpoint(request)) {
            long contentLength = request.getContentLengthLong();
            if (contentLength < 0) {
                writeError(
                        response,
                        HttpStatus.LENGTH_REQUIRED,
                        "Content-Length is required for workflow uploads.");
                return;
            }
            if (contentLength > MAX_MULTIPART_REQUEST_SIZE_BYTES) {
                writeError(
                        response,
                        HttpStatus.CONTENT_TOO_LARGE,
                        "Workflow upload exceeds the 16 MiB request limit.");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private boolean rateLimitExceeded(HttpServletRequest request) {
        long now = System.currentTimeMillis();
        RequestWindow entry =
                requestCounts.compute(
                        request.getRemoteAddr(),
                        (key, existing) -> {
                            if (existing == null || now - existing.windowStartMs() >= WINDOW_MS) {
                                return new RequestWindow(1, now);
                            }
                            return new RequestWindow(
                                    existing.requestCount() + 1, existing.windowStartMs());
                        });
        return entry.requestCount() > MAX_REQUESTS_PER_MINUTE;
    }

    private boolean isMultipartUploadEndpoint(HttpServletRequest request) {
        String path = normalizedRequestPath(request);
        return "POST".equalsIgnoreCase(request.getMethod())
                && (MULTIPART_UPLOAD_PATHS.contains(path)
                        || AUTHENTICATED_SIGN_PATH.matcher(path).matches());
    }

    private boolean isAuthenticatedWorkflowUploadPath(String path) {
        return AUTHENTICATED_CERTIFICATE_VALIDATION_PATH.equals(path)
                || AUTHENTICATED_SIGN_PATH.matcher(path).matches();
    }

    private String normalizedRequestPath(HttpServletRequest request) {
        String requestUri = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (!contextPath.isEmpty() && requestUri.startsWith(contextPath)) {
            requestUri = requestUri.substring(contextPath.length());
        }
        return requestUri.length() > 1 && requestUri.endsWith("/")
                ? requestUri.substring(0, requestUri.length() - 1)
                : requestUri;
    }

    private void writeError(HttpServletResponse response, HttpStatus status, String errorMessage)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"" + errorMessage + "\"}");
    }

    @Scheduled(fixedDelay = 300_000)
    public void cleanupExpiredWindows() {
        long cutoff = System.currentTimeMillis() - WINDOW_MS;
        requestCounts.entrySet().removeIf(entry -> entry.getValue().windowStartMs() < cutoff);
    }

    private record RequestWindow(int requestCount, long windowStartMs) {}
}
