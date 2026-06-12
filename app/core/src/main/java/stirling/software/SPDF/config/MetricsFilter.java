package stirling.software.SPDF.config;

import java.io.IOException;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import lombok.RequiredArgsConstructor;

import stirling.software.common.util.RequestUriUtils;

// Servlet filter retained (quarkus-undertow). Spring's OncePerRequestFilter replaced by a
// plain jakarta.servlet.Filter registered as a CDI bean via @WebFilter so it covers all
// requests; logic relies on HttpSession which is not exposed by a JAX-RS ContainerRequestFilter.
@ApplicationScoped
@WebFilter("/*")
@RequiredArgsConstructor(onConstructor_ = @Inject)
public class MetricsFilter implements jakarta.servlet.Filter {

    private final MeterRegistry meterRegistry;

    @Override
    public void doFilter(
            ServletRequest servletRequest, ServletResponse servletResponse, FilterChain filterChain)
            throws ServletException, IOException {
        HttpServletRequest request = (HttpServletRequest) servletRequest;
        String uri = request.getRequestURI();

        if (RequestUriUtils.isTrackableResource(request.getContextPath(), uri)) {
            HttpSession session = request.getSession(false);
            String sessionId = (session != null) ? session.getId() : "no-session";
            Counter counter =
                    Counter.builder("http.requests")
                            .tag("session", sessionId)
                            .tag("method", request.getMethod())
                            .tag("uri", uri)
                            .register(meterRegistry);

            counter.increment();
        }

        filterChain.doFilter(servletRequest, servletResponse);
    }
}
