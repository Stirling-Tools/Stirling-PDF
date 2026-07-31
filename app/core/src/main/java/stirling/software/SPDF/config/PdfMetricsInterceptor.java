package stirling.software.SPDF.config;

import java.io.IOException;
import java.util.Collection;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.Part;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.PdfMetricsService;

/**
 * Counts PDFs processed through the API so usage can be reported.
 *
 * <p>MIGRATION: was a Spring {@code HandlerInterceptor#afterCompletion}. Quarkus has no MVC
 * interceptor chain, so this is a servlet {@link Filter} that records after the chain returns - the
 * same "response is finished, then measure" point. The file count comes from the servlet {@link
 * Part} API instead of Spring's {@code MultipartHttpServletRequest#getMultiFileMap()}.
 */
@ApplicationScoped
@Slf4j
@RequiredArgsConstructor
public class PdfMetricsInterceptor implements Filter {

    private final PdfMetricsService pdfMetricsService;

    @Override
    public void doFilter(
            ServletRequest servletRequest, ServletResponse servletResponse, FilterChain filterChain)
            throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) servletRequest;
        HttpServletResponse response = (HttpServletResponse) servletResponse;

        filterChain.doFilter(request, response);

        try {
            if (!pdfMetricsService.isEnabled()) {
                return;
            }
            if (!"POST".equalsIgnoreCase(request.getMethod()) || response.getStatus() >= 400) {
                return;
            }
            String path = request.getServletPath();
            if (path == null || path.isBlank()) {
                path = request.getRequestURI();
            }
            if (path == null || !path.contains("/api/v1/")) {
                return;
            }
            String contentType = request.getContentType();
            if (contentType == null
                    || !contentType.toLowerCase().startsWith("multipart/form-data")) {
                return;
            }
            if (isFromEditor(request)) {
                return;
            }

            int fileCount = 0;
            Collection<Part> parts = request.getParts();
            if (parts != null) {
                for (Part part : parts) {
                    if (part.getSubmittedFileName() != null && part.getSize() > 0) {
                        fileCount++;
                    }
                }
            }
            if (fileCount == 0) {
                return;
            }

            pdfMetricsService.recordOperation(fileCount);
        } catch (Exception e) {
            log.debug("Failed to record PDF metrics", e);
        }
    }

    // Editor traffic carries X-Browser-Id, or (if a proxy strips it) a logged-in user's JWT.
    // JWTs start "eyJ" and have two dots; API keys do not, so they still count as API.
    private boolean isFromEditor(HttpServletRequest request) {
        String browserId = request.getHeader("X-Browser-Id");
        if (browserId != null && !browserId.isBlank()) {
            return true;
        }
        String auth = request.getHeader("Authorization");
        if (auth == null || !auth.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return false;
        }
        String token = auth.substring(7).trim();
        return token.startsWith("eyJ") && token.chars().filter(c -> c == '.').count() == 2;
    }
}
