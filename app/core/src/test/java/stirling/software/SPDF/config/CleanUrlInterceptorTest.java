package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

class CleanUrlInterceptorTest {

    private CleanUrlInterceptor interceptor;
    private HttpServletRequest request;
    private HttpServletResponse response;

    @BeforeEach
    void setUp() {
        interceptor = new CleanUrlInterceptor();
        request = mock(HttpServletRequest.class);
        response = mock(HttpServletResponse.class);
    }

    @Test
    void preHandleAllowsApiEndpoints() throws Exception {
        when(request.getRequestURI()).thenReturn("/api/v1/some-endpoint");
        when(request.getQueryString()).thenReturn("foo=bar&baz=qux");
        assertTrue(interceptor.preHandle(request, response, new Object()));
    }

    @Test
    void preHandleAllowsRequestWithNoQueryString() throws Exception {
        when(request.getRequestURI()).thenReturn("/some-page");
        when(request.getQueryString()).thenReturn(null);
        assertTrue(interceptor.preHandle(request, response, new Object()));
    }

    @Test
    void preHandleAllowsEmptyQueryString() throws Exception {
        when(request.getRequestURI()).thenReturn("/some-page");
        when(request.getQueryString()).thenReturn("");
        assertTrue(interceptor.preHandle(request, response, new Object()));
    }

    @Test
    void preHandleAllowsOnlyAllowedParams() throws Exception {
        when(request.getRequestURI()).thenReturn("/some-page");
        when(request.getQueryString()).thenReturn("lang=en");
        assertTrue(interceptor.preHandle(request, response, new Object()));
    }

    @Test
    void preHandleRedirectsWhenDisallowedParamsPresent() throws Exception {
        when(request.getRequestURI()).thenReturn("/some-page");
        when(request.getContextPath()).thenReturn("");
        when(request.getQueryString()).thenReturn("lang=en&evil=malicious");
        assertFalse(interceptor.preHandle(request, response, new Object()));
        verify(response).sendRedirect(contains("lang=en"));
    }

    @Test
    void preHandleRedirectsStrippingAllDisallowedParams() throws Exception {
        when(request.getRequestURI()).thenReturn("/page");
        when(request.getContextPath()).thenReturn("/ctx");
        when(request.getQueryString()).thenReturn("unknown=bad");
        assertFalse(interceptor.preHandle(request, response, new Object()));
        verify(response).sendRedirect(eq("/ctx/page?"));
    }

    @Test
    void preHandleAllowsMultipleAllowedParams() throws Exception {
        when(request.getRequestURI()).thenReturn("/page");
        when(request.getQueryString()).thenReturn("lang=en&endpoint=test&page=1");
        assertTrue(interceptor.preHandle(request, response, new Object()));
    }

    @Test
    void preHandleSkipsParamsWithNoEqualsSign() throws Exception {
        when(request.getRequestURI()).thenReturn("/page");
        when(request.getContextPath()).thenReturn("");
        when(request.getQueryString()).thenReturn("lang=en&malformed");
        // "malformed" has no '=', so keyValuePair.length != 2 -> skipped
        // allowedParameters has 1 entry (lang=en) but queryParameters.length is 2
        // So it redirects
        assertFalse(interceptor.preHandle(request, response, new Object()));
    }

    @Test
    void postHandleDoesNotThrow() {
        assertDoesNotThrow(() -> interceptor.postHandle(request, response, new Object(), null));
    }

    @Test
    void afterCompletionDoesNotThrow() {
        assertDoesNotThrow(
                () -> interceptor.afterCompletion(request, response, new Object(), null));
    }
}
