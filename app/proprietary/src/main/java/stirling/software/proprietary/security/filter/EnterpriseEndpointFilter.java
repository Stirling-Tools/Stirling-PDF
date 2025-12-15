package stirling.software.proprietary.security.filter;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class EnterpriseEndpointFilter extends OncePerRequestFilter {
    private final boolean runningProOrHigher;

    public EnterpriseEndpointFilter(@Qualifier("runningProOrHigher") boolean runningProOrHigher) {
        this.runningProOrHigher = runningProOrHigher;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        if (!runningProOrHigher && isPrometheusEndpointRequest(request)) {
            // Allow only health checks to pass through for non-pro users
            String uri = request.getRequestURI();
            boolean isHealthCheck =
                    uri.contains("/actuator/health")
                            || uri.contains("/healthz")
                            || uri.contains("/liveness")
                            || uri.contains("/readiness");

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
