package stirling.software.proprietary.security.filter;

import java.io.IOException;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.service.LicenseServiceInterface;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class EnterpriseEndpointFilter extends OncePerRequestFilter {
    private final LicenseServiceInterface licenseService;

    public EnterpriseEndpointFilter(LicenseServiceInterface licenseService) {
        this.licenseService = licenseService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI().substring(request.getContextPath().length());
        boolean saml = path.startsWith("/saml2/") || path.startsWith("/login/saml2/");
        if (saml && !licenseService.isRunningProOrHigher()) {
            response.sendError(HttpStatus.FORBIDDEN.value(), "A paid plan is required for SAML");
            return;
        }
        if (isPrometheusEndpointRequest(request) && !licenseService.isRunningProOrHigher()) {
            // Allow only health checks to pass through for non-pro users
            String uri = request.getRequestURI();

            // Strip the context path
            String contextPath = request.getContextPath();
            String trimmedUri =
                    (contextPath != null && uri.startsWith(contextPath))
                            ? uri.substring(contextPath.length())
                            : uri;

            boolean isHealthCheck =
                    trimmedUri.startsWith("/actuator/health")
                            || "/health".equals(trimmedUri)
                            || "/healthz".equals(trimmedUri)
                            || "/liveness".equals(trimmedUri)
                            || "/readiness".equals(trimmedUri);

            if (!isHealthCheck) {
                response.setStatus(HttpStatus.NOT_FOUND.value());
                return;
            }
        }
        filterChain.doFilter(request, response);
    }

    private boolean isPrometheusEndpointRequest(HttpServletRequest request) {
        return request.getRequestURI().contains("/actuator/");
    }
}
