package stirling.software.proprietary.mcp.security;

import java.io.IOException;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.context.SecurityContextHolder;

import jakarta.servlet.http.HttpServletResponse;

import tools.jackson.databind.ObjectMapper;

/** Authentication filters run before exception translation, so they must write their own denial. */
final class McpAccessDeniedResponse {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private McpAccessDeniedResponse() {}

    /** Clears authentication and writes only the policy's public account-access message. */
    static void write(HttpServletResponse response, AccessDeniedException denied)
            throws IOException {
        SecurityContextHolder.clearContext();
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        var body = MAPPER.createObjectNode();
        body.put("error", "insufficient_account");
        body.put("message", denied.getMessage());
        response.getWriter().write(MAPPER.writeValueAsString(body));
    }
}
