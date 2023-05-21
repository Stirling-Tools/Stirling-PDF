package stirling.software.SPDF.config;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class MetricsFilter extends OncePerRequestFilter {

    private final MeterRegistry meterRegistry;

    @Autowired
    public MetricsFilter(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String uri = request.getRequestURI();

        // Ignore static resources
        if (!(uri.startsWith("/js") || uri.startsWith("/images") || uri.endsWith(".ico") || uri.endsWith(".css") || uri.endsWith(".svg")|| uri.endsWith(".js") || uri.contains("swagger") || uri.startsWith("/api"))) {
            Counter counter = Counter.builder("http.requests")
                    .tag("uri", uri)
                    .tag("method", request.getMethod())
                    .register(meterRegistry);

            counter.increment();
        }

        filterChain.doFilter(request, response);
    }

    

}
