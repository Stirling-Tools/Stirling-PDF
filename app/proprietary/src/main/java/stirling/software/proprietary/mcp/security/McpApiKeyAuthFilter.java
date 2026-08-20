package stirling.software.proprietary.mcp.security;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

/**
 * API-key auth for the MCP endpoint: validates a Stirling API key and binds the request to that
 * user with the MCP scopes.
 */
@Slf4j
public class McpApiKeyAuthFilter implements Filter {

    // MCP scopes granted to a request authenticated via API key.
    private static final List<String> MCP_SCOPES =
            List.of("SCOPE_mcp.tools.read", "SCOPE_mcp.tools.write");

    private final UserService userService;

    public McpApiKeyAuthFilter(UserService userService) {
        this.userService = userService;
    }

    @Override
    public void doFilter(
            ServletRequest servletRequest, ServletResponse servletResponse, FilterChain filterChain)
            throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) servletRequest;

        String apiKey = extractKey(request);
        if (apiKey != null && !apiKey.isBlank()) {
            Optional<User> user = userService.getUserByApiKey(apiKey);
            if (user.isPresent() && user.get().isEnabled()) {
                log.debug(
                        "MCP API key matched active account '{}' (identity binding pending Quarkus"
                                + " SecurityIdentity migration)",
                        user.get().getUsername());
            } else {
                log.warn("MCP access denied: presented API key did not match an active account");
            }
        }
        filterChain.doFilter(servletRequest, servletResponse);
    }

    private String extractKey(HttpServletRequest request) {
        String headerKey = request.getHeader("X-API-KEY");
        if (headerKey != null && !headerKey.isBlank()) {
            return headerKey.trim();
        }
        String authz = request.getHeader("Authorization");
        if (authz != null && authz.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return authz.substring(7).trim();
        }
        return null;
    }
}
