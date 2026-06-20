package stirling.software.SPDF.config;

import java.util.List;

import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.PdfMetricsService;

@Component
@Slf4j
@RequiredArgsConstructor
public class PdfMetricsInterceptor implements HandlerInterceptor {

    private final PdfMetricsService pdfMetricsService;

    @Override
    public void afterCompletion(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler,
            Exception ex) {
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
            if (!(request instanceof MultipartHttpServletRequest multipart)) {
                return;
            }
            if (isFromEditor(request)) {
                return;
            }

            int fileCount = 0;
            for (List<MultipartFile> bucket : multipart.getMultiFileMap().values()) {
                fileCount += bucket.size();
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
