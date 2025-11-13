package stirling.software.proprietary.security;

import java.io.IOException;

import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class JwtAuthenticationEntryPoint implements AuthenticationEntryPoint {
    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authException)
            throws IOException {
        String contextPath = request.getContextPath();
        String requestURI = request.getRequestURI();

        // For API requests, return JSON error
        if (requestURI.startsWith(contextPath + "/api/")) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");
            String message =
                    authException != null ? authException.getMessage() : "Authentication required";
            response.getWriter().write("{\"error\":\"" + message + "\"}");
        } else {
            // For non-API requests, use default behavior
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, authException.getMessage());
        }
    }
}
