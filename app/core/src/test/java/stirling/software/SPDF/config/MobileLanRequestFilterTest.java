package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.FilterChain;

import stirling.software.SPDF.service.MobileLanListener;

class MobileLanRequestFilterTest {

    @ParameterizedTest
    @CsvSource({
        "GET, /mobile-scanner",
        "GET, /mobile-sign",
        "GET, /favicon.ico",
        "GET, /favicon.svg",
        "GET, /apple-touch-icon.png",
        "HEAD, /mobile-scanner",
        "GET, /api/v1/mobile-scanner/validate-session/abc-123",
        "POST, /api/v1/mobile-scanner/upload/abc-123"
    })
    void allowsWhatThePhonePagesUse(String method, String path) {
        assertTrue(MobileLanRequestFilter.isPhoneRequest(method, path));
    }

    @ParameterizedTest
    @CsvSource({
        "GET, /",
        "GET, /index.html",
        "GET, /api/v1/config/app-config",
        "POST, /api/v1/mobile-scanner/create-session/abc-123",
        "GET, /api/v1/mobile-scanner/files/abc-123",
        "GET, /api/v1/mobile-scanner/download/abc-123/scan.jpg",
        "DELETE, /api/v1/mobile-scanner/session/abc-123",
        "GET, /api/v1/mobile-scanner/upload/abc-123",
        "POST, /mobile-scanner",
        "POST, /api/v1/mobile-scanner/upload/abc/../../files/abc",
        "POST, /api/v1/security/cert-sign",
        "GET, /mobile-scanner/"
    })
    void refusesEverythingElse(String method, String path) {
        assertFalse(MobileLanRequestFilter.isPhoneRequest(method, path));
    }

    @Test
    void networkRequestOutsideThePhoneRoutesGets404() throws Exception {
        MobileLanListener listener = mock(MobileLanListener.class);
        when(listener.isEnabled()).thenReturn(true);
        MobileLanRequestFilter filter = new MobileLanRequestFilter(listener);
        MockHttpServletRequest request =
                new MockHttpServletRequest("GET", "/api/v1/config/app-config");
        request.setLocalAddr("192.168.1.20");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertEquals(404, response.getStatus());
        verifyNoInteractions(chain);
    }

    @Test
    void networkUploadPassesThrough() throws Exception {
        MobileLanListener listener = mock(MobileLanListener.class);
        when(listener.isEnabled()).thenReturn(true);
        MobileLanRequestFilter filter = new MobileLanRequestFilter(listener);
        MockHttpServletRequest request =
                new MockHttpServletRequest("POST", "/api/v1/mobile-scanner/upload/abc-123");
        request.setLocalAddr("192.168.1.20");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
    }

    @Test
    void loopbackRequestsAreNotFiltered() throws Exception {
        MobileLanListener listener = mock(MobileLanListener.class);
        when(listener.isEnabled()).thenReturn(true);
        MobileLanRequestFilter filter = new MobileLanRequestFilter(listener);
        MockHttpServletRequest request =
                new MockHttpServletRequest("GET", "/api/v1/config/app-config");
        request.setLocalAddr("127.0.0.1");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
    }

    @Test
    void doesNothingWhenTheListenerIsDisabled() throws Exception {
        MobileLanListener listener = mock(MobileLanListener.class);
        MobileLanRequestFilter filter = new MobileLanRequestFilter(listener);
        MockHttpServletRequest request =
                new MockHttpServletRequest("GET", "/api/v1/config/app-config");
        request.setLocalAddr("192.168.1.20");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
    }
}
