package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@ExtendWith(MockitoExtension.class)
class EndpointInterceptorTest {

    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private HttpServletRequest request;
    @Mock private HttpServletResponse response;

    private EndpointInterceptor interceptor;

    @BeforeEach
    void setUp() {
        interceptor = new EndpointInterceptor(endpointConfiguration);
    }

    @Test
    void preHandleAllowsEnabledApiEndpoint() throws Exception {
        when(request.getRequestURI()).thenReturn("/api/v1/general/remove-pages");
        when(endpointConfiguration.isEndpointEnabled("remove-pages")).thenReturn(true);
        assertTrue(interceptor.preHandle(request, response, new Object()));
    }

    @Test
    void preHandleBlocksDisabledApiEndpoint() throws Exception {
        when(request.getRequestURI()).thenReturn("/api/v1/general/remove-pages");
        when(endpointConfiguration.isEndpointEnabled("remove-pages")).thenReturn(false);
        assertFalse(interceptor.preHandle(request, response, new Object()));
        verify(response).sendError(HttpServletResponse.SC_FORBIDDEN, "This endpoint is disabled");
    }

    @Test
    void preHandleExtractsConvertEndpointCorrectly() throws Exception {
        when(request.getRequestURI()).thenReturn("/api/v1/convert/pdf/img");
        when(endpointConfiguration.isEndpointEnabled("pdf-to-img")).thenReturn(true);
        assertTrue(interceptor.preHandle(request, response, new Object()));
    }

    @Test
    void preHandleBlocksDisabledConvertEndpoint() throws Exception {
        when(request.getRequestURI()).thenReturn("/api/v1/convert/pdf/img");
        when(endpointConfiguration.isEndpointEnabled("pdf-to-img")).thenReturn(false);
        assertFalse(interceptor.preHandle(request, response, new Object()));
    }

    @Test
    void preHandleUsesFullUriForNonApiPaths() throws Exception {
        when(request.getRequestURI()).thenReturn("/some-page");
        when(endpointConfiguration.isEndpointEnabled("/some-page")).thenReturn(true);
        assertTrue(interceptor.preHandle(request, response, new Object()));
    }

    @Test
    void preHandleBlocksDisabledNonApiPath() throws Exception {
        when(request.getRequestURI()).thenReturn("/some-page");
        when(endpointConfiguration.isEndpointEnabled("/some-page")).thenReturn(false);
        assertFalse(interceptor.preHandle(request, response, new Object()));
    }

    @Test
    void preHandleUsesFullUriForShortApiPath() throws Exception {
        // URI with /api/v1 but not enough segments (split length <= 4)
        when(request.getRequestURI()).thenReturn("/api/v1/general");
        when(endpointConfiguration.isEndpointEnabled("/api/v1/general")).thenReturn(true);
        assertTrue(interceptor.preHandle(request, response, new Object()));
    }

    @Test
    void preHandleExtractsNonConvertApiEndpoint() throws Exception {
        when(request.getRequestURI()).thenReturn("/api/v1/security/add-watermark");
        when(endpointConfiguration.isEndpointEnabled("add-watermark")).thenReturn(true);
        assertTrue(interceptor.preHandle(request, response, new Object()));
    }
}
