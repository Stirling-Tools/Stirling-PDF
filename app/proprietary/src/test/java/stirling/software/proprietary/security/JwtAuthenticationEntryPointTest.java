package stirling.software.proprietary.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.*;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.proprietary.security.model.exception.AuthenticationFailureException;

@ExtendWith(MockitoExtension.class)
class JwtAuthenticationEntryPointTest {

    @Mock private HttpServletRequest request;

    @Mock private HttpServletResponse response;

    @Mock private AuthenticationFailureException authException;

    @InjectMocks private JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint;

    @Test
    void testCommence() throws IOException {
        String errorMessage = "Authentication failed";

        when(request.getRequestURI()).thenReturn("/redact");
        when(authException.getMessage()).thenReturn(errorMessage);

        jwtAuthenticationEntryPoint.commence(request, response, authException);

        verify(response).sendError(HttpServletResponse.SC_UNAUTHORIZED, errorMessage);
    }

    @Test
    void percentEncodedApiPathGetsJsonError() throws IOException {
        when(authException.getMessage()).thenReturn("Authentication required");
        MockHttpServletRequest encoded =
                new MockHttpServletRequest("GET", "/app/%61pi/v1/info/load/all");
        encoded.setContextPath("/app");
        MockHttpServletResponse result = new MockHttpServletResponse();

        jwtAuthenticationEntryPoint.commence(encoded, result, authException);

        assertEquals(HttpServletResponse.SC_UNAUTHORIZED, result.getStatus());
        assertTrue(result.getContentType().startsWith("application/json"));
    }
}
