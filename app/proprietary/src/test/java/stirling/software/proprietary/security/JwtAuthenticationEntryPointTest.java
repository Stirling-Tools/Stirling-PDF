package stirling.software.proprietary.security;

import static org.mockito.Mockito.*;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

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
        when(authException.getMessage()).thenReturn(errorMessage);

        jwtAuthenticationEntryPoint.commence(request, response, authException);

        verify(response).sendError(HttpServletResponse.SC_UNAUTHORIZED, errorMessage);
    }
}
