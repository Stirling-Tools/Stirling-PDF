package stirling.software.proprietary.security.filter;

import java.io.IOException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.inject.Named;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.ws.rs.core.Response;

// Spring's OncePerRequestFilter has no Quarkus equivalent; implementing jakarta.servlet.Filter
// directly. Registered via @WebFilter (quarkus-undertow). The single-execution-per-request
// guarantee OncePerRequestFilter provided is effectively given for top-level servlet filters here.
// TODO: Migration required - if this filter must run before/after other filters, ordering is not
// expressed by @WebFilter; configure quarkus.http.filter.* or a ServletExtension if order matters.
@ApplicationScoped
@WebFilter(urlPatterns = "/*")
public class EnterpriseEndpointFilter implements Filter {
    private final boolean runningProOrHigher;

    @Inject
    public EnterpriseEndpointFilter(@Named("runningProOrHigher") boolean runningProOrHigher) {
        this.runningProOrHigher = runningProOrHigher;
    }

    @Override
    public void doFilter(
            ServletRequest servletRequest, ServletResponse servletResponse, FilterChain filterChain)
            throws ServletException, IOException {

        HttpServletRequest request = (HttpServletRequest) servletRequest;
        HttpServletResponse response = (HttpServletResponse) servletResponse;

        if (!runningProOrHigher && isPrometheusEndpointRequest(request)) {
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
                response.setStatus(Response.Status.NOT_FOUND.getStatusCode());
                return;
            }
        }
        filterChain.doFilter(request, response);
    }

    private boolean isPrometheusEndpointRequest(HttpServletRequest request) {
        return request.getRequestURI().contains("/actuator/");
    }
}
