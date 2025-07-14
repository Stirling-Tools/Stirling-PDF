package stirling.software.proprietary.web;

import java.io.IOException;
import java.util.Map;

import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Filter that stores additional request information for audit purposes */
@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
@RequiredArgsConstructor
public class AuditWebFilter extends OncePerRequestFilter {

    private static final String USER_AGENT_HEADER = "User-Agent";
    private static final String REFERER_HEADER = "Referer";
    private static final String ACCEPT_LANGUAGE_HEADER = "Accept-Language";
    private static final String CONTENT_TYPE_HEADER = "Content-Type";

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        // Store key request info in MDC for logging and later audit use
        try {
            // Store request headers
            String userAgent = request.getHeader(USER_AGENT_HEADER);
            if (userAgent != null) {
                MDC.put("userAgent", userAgent);
            }

            String referer = request.getHeader(REFERER_HEADER);
            if (referer != null) {
                MDC.put("referer", referer);
            }

            String acceptLanguage = request.getHeader(ACCEPT_LANGUAGE_HEADER);
            if (acceptLanguage != null) {
                MDC.put("acceptLanguage", acceptLanguage);
            }

            String contentType = request.getHeader(CONTENT_TYPE_HEADER);
            if (contentType != null) {
                MDC.put("contentType", contentType);
            }

            // Store authenticated user roles if available
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.getAuthorities() != null) {
                String roles =
                        auth.getAuthorities().stream()
                                .map(a -> a.getAuthority())
                                .reduce((a, b) -> a + "," + b)
                                .orElse("");
                MDC.put("userRoles", roles);
            }

            // Store query parameters (without values for privacy)
            Map<String, String[]> parameterMap = request.getParameterMap();
            if (parameterMap != null && !parameterMap.isEmpty()) {
                String params = String.join(",", parameterMap.keySet());
                MDC.put("queryParams", params);
            }

            // Continue with the filter chain
            filterChain.doFilter(request, response);

        } finally {
            // Clear MDC after request is processed
            MDC.remove("userAgent");
            MDC.remove("referer");
            MDC.remove("acceptLanguage");
            MDC.remove("contentType");
            MDC.remove("userRoles");
            MDC.remove("queryParams");
        }
    }
}
