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
    void preHandleAllowsEnabledEndpoint() throws Exception {
        when(request.getRequestURI()).thenReturn("/api/v1/general/remove-pages");
        when(endpointConfiguration.isEndpointEnabledForUri("/api/v1/general/remove-pages"))
                .thenReturn(true);
        assertTrue(interceptor.preHandle(request, response, new Object()));
    }

    @Test
    void preHandleBlocksDisabledEndpoint() throws Exception {
        when(request.getRequestURI()).thenReturn("/api/v1/general/remove-pages");
        when(endpointConfiguration.isEndpointEnabledForUri("/api/v1/general/remove-pages"))
                .thenReturn(false);
        assertFalse(interceptor.preHandle(request, response, new Object()));
        verify(response).sendError(HttpServletResponse.SC_FORBIDDEN, "This endpoint is disabled");
    }
}
