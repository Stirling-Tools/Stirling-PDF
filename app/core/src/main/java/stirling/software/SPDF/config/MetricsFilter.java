package stirling.software.SPDF.config;

import java.io.IOException;

import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import lombok.RequiredArgsConstructor;

import stirling.software.common.util.RequestUriUtils;

@Component
@RequiredArgsConstructor
public class MetricsFilter extends OncePerRequestFilter {

    private final MeterRegistry meterRegistry;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (!RequestUriUtils.isTrackableResource(
                request.getContextPath(), request.getRequestURI())) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            filterChain.doFilter(request, response);
        } finally {
            String uri = countedUri(request);

            if (uri != null) {
                HttpSession session = request.getSession(false);
                String sessionId = (session != null) ? session.getId() : "no-session";
                Counter counter =
                        Counter.builder("http.requests")
                                .tag("session", sessionId)
                                .tag("method", request.getMethod())
                                .tag("uri", uri)
                                .register(meterRegistry);

                counter.increment();
            }
        }
    }

    private static String countedUri(HttpServletRequest request) {
        String contextPath = request.getContextPath();
        String requestUri = request.getRequestURI();
        String path =
                requestUri.startsWith(contextPath)
                        ? requestUri.substring(contextPath.length())
                        : requestUri;

        if (path.startsWith("/api/")) {
            Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
            return pattern instanceof String s && s.startsWith("/api/") ? contextPath + s : null;
        }

        int secondSlash = path.indexOf('/', 1);
        return contextPath + (secondSlash < 0 ? path : path.substring(0, secondSlash));
    }
}
