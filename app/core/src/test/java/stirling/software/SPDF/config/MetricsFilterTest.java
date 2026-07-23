package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

class MetricsFilterTest {

    private SimpleMeterRegistry registry;
    private MetricsFilter filter;
    private HttpServletRequest request;
    private HttpServletResponse response;
    private FilterChain chain;

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        MetricsConfig metricsConfig = new MetricsConfig();
        registry.config().meterFilter(metricsConfig.meterFilter());
        registry.config().meterFilter(metricsConfig.uriCardinalityLimit());
        filter = new MetricsFilter(registry);
        request = mock(HttpServletRequest.class);
        response = mock(HttpServletResponse.class);
        chain = mock(FilterChain.class);
    }

    @Test
    @DisplayName("bounds counters created from unique URIs")
    void boundsUniqueUriCounters() {
        for (int index = 0; index <= MetricsConfig.MAX_URI_TAG_VALUES; index++) {
            registry.counter(
                            "http.requests",
                            "method",
                            "POST",
                            "uri",
                            "/api/v1/general/tool-" + index)
                    .increment();
        }

        assertEquals(MetricsConfig.MAX_URI_TAG_VALUES, registry.getMeters().size());
    }

    @Test
    @DisplayName("does not multiply counters across sessions and URIs")
    void boundsSessionAndUriCombinations() throws Exception {
        when(request.getContextPath()).thenReturn("");
        when(request.getMethod()).thenReturn("POST");

        for (int index = 0; index <= MetricsConfig.MAX_URI_TAG_VALUES; index++) {
            when(request.getRequestURI()).thenReturn("/api/v1/general/tool-" + index);
            filter.doFilterInternal(request, response, chain);
        }

        assertEquals(MetricsConfig.MAX_URI_TAG_VALUES, registry.getMeters().size());
        verify(request, never()).getSession(false);
    }

    @Nested
    @DisplayName("trackable requests")
    class Trackable {

        @Test
        @DisplayName("increments a counter for a trackable URI")
        void countsTrackableRequest() throws Exception {
            when(request.getRequestURI()).thenReturn("/api/v1/general/rotate-pdf");
            when(request.getContextPath()).thenReturn("");
            when(request.getMethod()).thenReturn("POST");

            filter.doFilterInternal(request, response, chain);

            verify(chain).doFilter(request, response);
            assertEquals(
                    1.0,
                    registry.get("http.requests")
                            .tags("method", "POST", "uri", "/api/v1/general/rotate-pdf")
                            .counter()
                            .count());
            verify(request, never()).getSession(false);
        }
    }

    @Nested
    @DisplayName("non-trackable requests")
    class NonTrackable {

        @Test
        @DisplayName("static resource is not counted but chain continues")
        void staticResourceSkipped() throws Exception {
            when(request.getRequestURI()).thenReturn("/css/style.css");
            when(request.getContextPath()).thenReturn("");

            filter.doFilterInternal(request, response, chain);

            verify(chain).doFilter(request, response);
            verify(request, never()).getMethod();
        }
    }
}
