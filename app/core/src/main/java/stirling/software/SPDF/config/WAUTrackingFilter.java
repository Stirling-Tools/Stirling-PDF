package stirling.software.SPDF.config;

import java.io.IOException;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.WeeklyActiveUsersService;

/**
 * Filter to track browser IDs for Weekly Active Users (WAU) counting.
 * Only active when security is disabled (no-login mode).
 */
@Component
@ConditionalOnProperty(name = "security.enableLogin", havingValue = "false")
@RequiredArgsConstructor
@Slf4j
public class WAUTrackingFilter implements Filter {

    private final WeeklyActiveUsersService wauService;

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        if (request instanceof HttpServletRequest httpRequest) {
            // Extract browser ID from header
            String browserId = httpRequest.getHeader("X-Browser-Id");

            if (browserId != null && !browserId.trim().isEmpty()) {
                // Record browser access
                wauService.recordBrowserAccess(browserId);
            }
        }

        // Continue the filter chain
        chain.doFilter(request, response);
    }
}
