package stirling.software.SPDF.config;

import java.io.IOException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.ext.Provider;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.WeeklyActiveUsersService;

/**
 * Filter to track browser IDs for Weekly Active Users (WAU) counting. Only active when security is
 * disabled (no-login mode).
 */
// TODO: Migration required - Spring @ConditionalOnProperty(name="security.enableLogin",
// havingValue="false") had no direct CDI equivalent for conditional bean registration. The filter
// is now always registered (@Provider) and the condition is enforced at request time by reading the
// 'security.enableLogin' config property below. Verify the property key matches Quarkus config
// (originally bound from ApplicationProperties.security.enableLogin).
@Provider
@ApplicationScoped
@RequiredArgsConstructor
@Slf4j
public class WAUTrackingFilter implements ContainerRequestFilter {

    private final WeeklyActiveUsersService wauService;

    @ConfigProperty(name = "security.enableLogin", defaultValue = "false")
    boolean enableLogin;

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        // Only active when security is disabled (no-login mode)
        if (enableLogin) {
            return;
        }

        // Extract browser ID from header
        String browserId = requestContext.getHeaderString("X-Browser-Id");

        if (browserId != null && !browserId.trim().isEmpty()) {
            // Record browser access
            wauService.recordBrowserAccess(browserId);
        }
    }
}
