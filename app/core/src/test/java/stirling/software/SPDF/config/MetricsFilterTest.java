package stirling.software.SPDF.config;

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
            when(request.getContextPath()).thenReturn("");
            when(request.getMethod()).thenReturn("POST");
            when(request.getSession(false)).thenReturn(session);

            filter.doFilterInternal(request, response, chain);

            verify(chain).doFilter(request, response);
        }

        @Test
        @DisplayName("uses no-session tag when session is absent")
        void countsWithoutSession() throws Exception {
            when(request.getRequestURI()).thenReturn("/api/v1/general/merge-pdfs");
            when(request.getContextPath()).thenReturn("");
            when(request.getMethod()).thenReturn("POST");
            when(request.getSession(false)).thenReturn(null);

            filter.doFilterInternal(request, response, chain);

            verify(chain).doFilter(request, response);
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
