package stirling.software.proprietary.security.filter;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.service.LicenseServiceInterface;

@Component
public class EnterpriseEndpointFilter extends OncePerRequestFilter {
    private final boolean runningProOrHigher;

    private final LicenseServiceInterface licenseService;

    public EnterpriseEndpointFilter(
            @Qualifier("runningProOrHigher") boolean runningProOrHigher,
            @Autowired(required = false) LicenseServiceInterface licenseService) {
        this.runningProOrHigher = runningProOrHigher;
        this.licenseService = licenseService;
    }

    private boolean isProOrHigher() {
        return runningProOrHigher
                || (licenseService != null && licenseService.isRunningProOrHigher());
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        if (isPrometheusEndpointRequest(request) && !isProOrHigher()) {
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
