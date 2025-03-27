package stirling.software.SPDF.config;

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
            response.setStatus(HttpStatus.NOT_FOUND.value());
            return;
        }
        filterChain.doFilter(request, response);
    }

    private boolean isPrometheusEndpointRequest(HttpServletRequest request) {
        return request.getRequestURI().contains("/actuator/");
    }
}
