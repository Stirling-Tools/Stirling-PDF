package stirling.software.SPDF.config;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.http.HttpServletRequest;

import stirling.software.SPDF.service.WeeklyActiveUsersService;

class WAUTrackingFilterTest {

    private WeeklyActiveUsersService wauService;
    private WAUTrackingFilter filter;
    private jakarta.servlet.ServletResponse response;
    private FilterChain chain;

    @BeforeEach
    void setUp() {
        wauService = mock(WeeklyActiveUsersService.class);
        filter = new WAUTrackingFilter(wauService);
        response = mock(jakarta.servlet.ServletResponse.class);
        chain = mock(FilterChain.class);
    }

    @Nested
    @DisplayName("browser id handling")
    class BrowserId {

        @Test
        @DisplayName("records access when header present")
        void recordsWhenPresent() throws Exception {
            HttpServletRequest request = mock(HttpServletRequest.class);
            when(request.getHeader("X-Browser-Id")).thenReturn("browser-42");

            filter.doFilter(request, response, chain);

            verify(wauService).recordBrowserAccess("browser-42");
            verify(chain).doFilter(request, response);
        }

        @Test
        @DisplayName("does not record when header is null")
        void skipsWhenNull() throws Exception {
            HttpServletRequest request = mock(HttpServletRequest.class);
            when(request.getHeader("X-Browser-Id")).thenReturn(null);

            filter.doFilter(request, response, chain);

            verify(wauService, never()).recordBrowserAccess(anyString());
            verify(chain).doFilter(request, response);
        }

        @Test
        @DisplayName("does not record when header is blank")
        void skipsWhenBlank() throws Exception {
            HttpServletRequest request = mock(HttpServletRequest.class);
            when(request.getHeader("X-Browser-Id")).thenReturn("   ");

            filter.doFilter(request, response, chain);

            verify(wauService, never()).recordBrowserAccess(anyString());
            verify(chain).doFilter(request, response);
        }
    }

    @Nested
    @DisplayName("non-http requests")
    class NonHttp {

        @Test
        @DisplayName("passes through without recording")
        void nonHttpPassThrough() throws Exception {
            ServletRequest request = mock(ServletRequest.class);

            filter.doFilter(request, response, chain);

            verify(wauService, never()).recordBrowserAccess(anyString());
            verify(chain).doFilter(request, response);
        }
    }
}
