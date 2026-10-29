package stirling.software.SPDF.config;

import java.io.IOException;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.MobileScannerService;
import stirling.software.common.util.RequestUriUtils;

/**
 * Rejects mobile scanner uploads before their body is read. The upload endpoint needs no login, and
 * the multipart body is written to disk before the controller runs, so an upload to an unknown
 * session or one larger than a session can hold would otherwise cost up to the global multipart
 * limit in disk space first.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@RequiredArgsConstructor
public class MobileScannerUploadFilter extends OncePerRequestFilter {

    private static final String UPLOAD_PREFIX = "/api/v1/mobile-scanner/upload/";
    // Room for the multipart boundaries and part headers on top of the file bytes.
    private static final long MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

    private final MobileScannerService mobileScannerService;
    private final ApplicationProperties applicationProperties;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        ApplicationProperties.System system = applicationProperties.getSystem();
        // When the feature is off the controller answers 403 without touching the session.
        return !"POST".equals(request.getMethod())
                || !(system.isEnableMobileScanner() || system.isEnableMobileSignature())
                || !RequestUriUtils.normalizeUri(request.getContextPath(), request.getRequestURI())
                        .startsWith(UPLOAD_PREFIX);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String path =
                RequestUriUtils.normalizeUri(request.getContextPath(), request.getRequestURI());
        String sessionId = path.substring(UPLOAD_PREFIX.length());
        long remaining = mobileScannerService.remainingSessionBytes(sessionId);
        if (remaining < 0) {
            reject(response, HttpStatus.BAD_REQUEST, "Session not found or expired");
            return;
        }
        long length = request.getContentLengthLong();
        if (length < 0) {
            reject(response, HttpStatus.LENGTH_REQUIRED, "Content-Length is required");
            return;
        }
        if (length > remaining + MULTIPART_OVERHEAD_BYTES) {
            reject(response, HttpStatus.CONTENT_TOO_LARGE, "Session upload limit reached");
            return;
        }
        filterChain.doFilter(request, response);
    }

    private static void reject(HttpServletResponse response, HttpStatus status, String message)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"error\":\"" + message + "\"}");
    }
}
