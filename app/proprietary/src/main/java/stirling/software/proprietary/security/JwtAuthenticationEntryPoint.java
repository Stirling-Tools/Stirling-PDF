package stirling.software.proprietary.security;

import java.io.IOException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

// TODO: Migration required - this was a Spring Security AuthenticationEntryPoint
// (org.springframework.security.web.AuthenticationEntryPoint). Quarkus has no direct
// AuthenticationEntryPoint SPI; unauthenticated-access handling is wired via
// quarkus.http.auth.* policies and an AuthenticationFailedException mapper / a
// jakarta.ws.rs.ext.ExceptionMapper<io.quarkus.security.UnauthorizedException> (or a
// ContainerRequestFilter). The response-shaping logic below is preserved as a plain
// helper bean; the caller that previously registered this entry point must invoke
// commence(...) from the Quarkus failure-handling path. The AuthenticationException
// parameter was replaced with a generic Exception to drop the Spring dependency.
@ApplicationScoped
public class JwtAuthenticationEntryPoint {

    public void commence(
            HttpServletRequest request, HttpServletResponse response, Exception authException)
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
            response.sendError(
                    HttpServletResponse.SC_UNAUTHORIZED,
                    authException != null ? authException.getMessage() : "Authentication required");
        }
    }
}
