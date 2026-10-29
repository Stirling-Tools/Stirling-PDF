package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.HandlerMapping;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

class MetricsFilterTest {

    private SimpleMeterRegistry registry;
    private MetricsFilter filter;
    private HttpServletRequest request;
    private HttpServletResponse response;
    private FilterChain chain;

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        filter = new MetricsFilter(registry);
        request = mock(HttpServletRequest.class);
        response = mock(HttpServletResponse.class);
        chain = mock(FilterChain.class);
    }

    @Nested
    @DisplayName("trackable requests")
    class Trackable {

        @Test
        @DisplayName("increments a counter for a trackable URI with session")
        void countsWithSession() throws Exception {
            HttpSession session = mock(HttpSession.class);
            when(session.getId()).thenReturn("sess-1");
            when(request.getRequestURI()).thenReturn("/api/v1/general/rotate-pdf");
            when(request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE))
                    .thenReturn("/api/v1/general/rotate-pdf");
            when(request.getContextPath()).thenReturn("");
            when(request.getMethod()).thenReturn("POST");
            when(request.getSession(false)).thenReturn(session);

            filter.doFilterInternal(request, response, chain);

            verify(chain).doFilter(request, response);
            assertEquals(
                    1.0,
                    registry.get("http.requests")
                            .tag("session", "sess-1")
                            .tag("method", "POST")
                            .tag("uri", "/api/v1/general/rotate-pdf")
                            .counter()
                            .count());
        }

        @Test
        @DisplayName("uses no-session tag when session is absent")
        void countsWithoutSession() throws Exception {
            when(request.getRequestURI()).thenReturn("/api/v1/general/merge-pdfs");
            when(request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE))
                    .thenReturn("/api/v1/general/merge-pdfs");
            when(request.getContextPath()).thenReturn("");
            when(request.getMethod()).thenReturn("POST");
            when(request.getSession(false)).thenReturn(null);

            filter.doFilterInternal(request, response, chain);

            verify(chain).doFilter(request, response);
            assertNotNull(registry.find("http.requests").tag("session", "no-session").counter());
        }

        @Test
        @DisplayName("tags API calls with the route pattern, not the path variable values")
        void tagsRoutePatternInsteadOfPathVariables() throws Exception {
            String route = "/api/v1/mobile-scanner/files/{sessionId}";
            when(request.getRequestURI()).thenReturn("/api/v1/mobile-scanner/files/secret-id");
            when(request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE))
                    .thenReturn(route);
            when(request.getContextPath()).thenReturn("");
            when(request.getMethod()).thenReturn("GET");

            filter.doFilterInternal(request, response, chain);

            assertEquals(1, registry.find("http.requests").counters().size());
            assertNotNull(registry.find("http.requests").tag("uri", route).counter());
        }

        @Test
        @DisplayName("keeps the context path in front of the route pattern")
        void keepsContextPath() throws Exception {
            when(request.getRequestURI()).thenReturn("/pdf/api/v1/general/job/abc");
            when(request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE))
                    .thenReturn("/api/v1/general/job/{jobId}");
            when(request.getContextPath()).thenReturn("/pdf");
            when(request.getMethod()).thenReturn("GET");

            filter.doFilterInternal(request, response, chain);

            assertNotNull(
                    registry.find("http.requests")
                            .tag("uri", "/pdf/api/v1/general/job/{jobId}")
                            .counter());
        }

        @Test
        @DisplayName("keeps the URI of top-level SPA pages")
        void tagsUriForSpaPages() throws Exception {
            when(request.getRequestURI()).thenReturn("/merge-pdfs");
            when(request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE))
                    .thenReturn("/{path:[^\\.]*$}");
            when(request.getContextPath()).thenReturn("");
            when(request.getMethod()).thenReturn("GET");

            filter.doFilterInternal(request, response, chain);

            assertNotNull(registry.find("http.requests").tag("uri", "/merge-pdfs").counter());
        }

        @Test
        @DisplayName("tags SPA pages carrying a token in the path with the first segment only")
        void tagsFirstSegmentForTokenPages() throws Exception {
            when(request.getRequestURI()).thenReturn("/workflow/sign/secret-token");
            when(request.getContextPath()).thenReturn("");
            when(request.getMethod()).thenReturn("GET");

            filter.doFilterInternal(request, response, chain);

            assertEquals(1, registry.find("http.requests").counters().size());
            assertNotNull(registry.find("http.requests").tag("uri", "/workflow").counter());
            assertNull(
                    registry.find("http.requests")
                            .tag("uri", "/workflow/sign/secret-token")
                            .counter());
        }

        @Test
        @DisplayName("counts the request even when the chain throws")
        void countsWhenChainThrows() throws Exception {
            when(request.getRequestURI()).thenReturn("/api/v1/general/rotate-pdf");
            when(request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE))
                    .thenReturn("/api/v1/general/rotate-pdf");
            when(request.getContextPath()).thenReturn("");
            when(request.getMethod()).thenReturn("POST");
            doThrow(new RuntimeException("boom")).when(chain).doFilter(request, response);

            assertThrows(
                    RuntimeException.class,
                    () -> filter.doFilterInternal(request, response, chain));

            assertNotNull(
                    registry.find("http.requests")
                            .tag("uri", "/api/v1/general/rotate-pdf")
                            .counter());
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

        @Test
        @DisplayName("API call that matched no route is not counted")
        void unmatchedApiCallSkipped() throws Exception {
            when(request.getRequestURI()).thenReturn("/api/v1/unknown/some-value");
            when(request.getContextPath()).thenReturn("");

            filter.doFilterInternal(request, response, chain);

            verify(chain).doFilter(request, response);
            assertTrue(registry.find("http.requests").counters().isEmpty());
        }
    }
}
