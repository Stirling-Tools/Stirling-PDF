package stirling.software.proprietary.security;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.util.RequestUriUtils;

@Component
public class JwtAuthenticationEntryPoint implements AuthenticationEntryPoint {

    /** Whether guests may still use the tools; the 401 body says so. */
    private final boolean anonymousAccessAllowed;

    /** Standalone use (tests, and builds without the security module) allows no guest access. */
    public JwtAuthenticationEntryPoint() {
        this(false);
    }

    public JwtAuthenticationEntryPoint(
            @Qualifier("anonymousAccessAllowed") boolean anonymousAccessAllowed) {
        this.anonymousAccessAllowed = anonymousAccessAllowed;
    }

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authException)
            throws IOException {
        // For API requests, return JSON error
        if (RequestUriUtils.isApiRequest(request.getContextPath(), request.getRequestURI())) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");
            String message =
                    authException != null ? authException.getMessage() : "Authentication required";
            // Told explicitly so a client can render the guest shell instead of a login wall
            // when only the account-scoped half of the API turned the call away.
            response.getWriter()
                    .write(
                            "{\"error\":\""
                                    + message
                                    + "\",\"authenticated\":false,\"guestAccess\":"
                                    + anonymousAccessAllowed
                                    + "}");
        } else {
            // For non-API requests, use default behavior
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, authException.getMessage());
        }
    }
}
