package stirling.software.proprietary.mcp.security;

import java.io.IOException;

import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Answers OAuth discovery in API-key mode with an honest 404; a 401 there reads to an OAuth-only
 * client as "your credentials are wrong" rather than "this server has no OAuth".
 */
public class McpNoOAuthMetadataFilter extends OncePerRequestFilter {

    private static final String BODY =
            "{\"error\":\"not_found\",\"message\":\"This server runs MCP in API-key mode and"
                    + " publishes no OAuth metadata. Send a Stirling API key in the X-API-KEY"
                    + " header, or set mcp.auth.mode=builtin to enable the built-in OAuth"
                    + " authorization server for clients that require OAuth.\"}";

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        String contextPath = request.getContextPath();
        String trimmed =
                (contextPath != null && !contextPath.isEmpty() && path.startsWith(contextPath))
                        ? path.substring(contextPath.length())
                        : path;
        if (trimmed.startsWith("/.well-known/")) {
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.setContentType("application/json");
            response.getWriter().write(BODY);
            return;
        }
        filterChain.doFilter(request, response);
    }
}
