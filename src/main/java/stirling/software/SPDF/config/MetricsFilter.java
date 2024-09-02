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
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String uri = request.getRequestURI();

        // System.out.println("uri="+uri + ", method=" + request.getMethod() );
        // Ignore static resources
        if (!(uri.startsWith("/js")
                || uri.startsWith("/v1/api-docs")
                || uri.endsWith("robots.txt")
                || uri.startsWith("/images")
                || uri.endsWith(".png")
                || uri.endsWith(".ico")
                || uri.endsWith(".css")
                || uri.endsWith(".map")
                || uri.endsWith(".svg")
                || uri.endsWith(".js")
                || uri.contains("swagger")
                || uri.startsWith("/api/v1/info")
                || uri.startsWith("/site.webmanifest")
                || uri.startsWith("/fonts")
                || uri.startsWith("/pdfjs"))) {

            Counter counter =
                    Counter.builder("http.requests")
                            .tag("uri", uri)
                            .tag("method", request.getMethod())
                            .register(meterRegistry);

            counter.increment();
            // System.out.println("Counted");
        }

        filterChain.doFilter(request, response);
    }
}
