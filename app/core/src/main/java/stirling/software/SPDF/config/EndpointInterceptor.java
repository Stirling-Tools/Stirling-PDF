package stirling.software.SPDF.config;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.RequestUriUtils;

@Component
@Slf4j
@RequiredArgsConstructor
public class EndpointInterceptor implements HandlerInterceptor {

    private final EndpointConfiguration endpointConfiguration;

    @Override
    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        String requestURI;
        try {
            requestURI =
                    RequestUriUtils.normalizeUri(request.getContextPath(), request.getRequestURI());
        } catch (IllegalArgumentException e) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST);
            return false;
        }

        // Prevent API responses from being stored by browsers or intermediary caches by default
        String servletPath = request.getServletPath();
        if (servletPath != null && servletPath.startsWith("/api/")) {
            response.setHeader("Cache-Control", "private, no-store");
        }

        boolean isEnabled = endpointConfiguration.isEndpointEnabledForUri(requestURI);
        if (!isEnabled) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN, "This endpoint is disabled");
            return false;
        }
        return true;
    }
}
