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
import stirling.software.common.util.RequestUriUtils;

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

        String trimmedUri;
        try {
            trimmedUri =
                    RequestUriUtils.normalizeUri(request.getContextPath(), request.getRequestURI());
        } catch (IllegalArgumentException e) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST);
            return;
        }

        if (trimmedUri.contains("/actuator/") && !licenseService.isRunningProOrHigher()) {
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
}
