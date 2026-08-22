package stirling.software.SPDF.config;

import java.io.IOException;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;

import stirling.software.common.util.RequestUriUtils;

@Component
@ConditionalOnBooleanProperty(name = "metrics.enabled")
@RequiredArgsConstructor
public class MetricsFilter extends OncePerRequestFilter {

    private final MeterRegistry meterRegistry;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String uri = request.getRequestURI();

        if (RequestUriUtils.isTrackableResource(request.getContextPath(), uri)) {
            Counter counter =
                    Counter.builder("http.requests")
                            .tag("method", request.getMethod())
                            .tag("uri", uri)
                            .register(meterRegistry);

            counter.increment();
        }

        filterChain.doFilter(request, response);
    }
}
