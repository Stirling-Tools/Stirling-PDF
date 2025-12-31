package stirling.software.proprietary.security.filter;

import java.io.IOException;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

/**
 * Filter that redirects browser requests to /login to the frontend URL when configured. This is
 * needed for development mode where frontend runs on a different port, and for SAML logout which
 * redirects to /login?logout after SLO completes.
 */
@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@RequiredArgsConstructor
public class LoginRedirectFilter extends OncePerRequestFilter {

    private final ApplicationProperties applicationProperties;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();
        String frontendUrl = applicationProperties.getSystem().getFrontendUrl();

        // Only process /login requests when frontendUrl is configured
        if (path.equals("/login") && frontendUrl != null && !frontendUrl.isBlank()) {
            // Check if this is a browser request (Accept: text/html) vs API request
            // (Accept: application/json)
            String acceptHeader = request.getHeader("Accept");
            boolean isBrowserRequest =
                    acceptHeader != null
                            && acceptHeader.contains("text/html")
                            && !acceptHeader.contains("application/json");

            if (isBrowserRequest) {
                // Preserve query parameters (e.g., ?logout=true, ?error=xxx)
                String queryString = request.getQueryString();
                String redirectUrl =
                        frontendUrl + "/login" + (queryString != null ? "?" + queryString : "");
                log.debug("Redirecting browser request to frontend: {}", redirectUrl);
                response.sendRedirect(redirectUrl);
                return;
            }
        }

        filterChain.doFilter(request, response);
    }
}
