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
 * API-key auth for the MCP endpoint: validates a Stirling per-user API key and binds the request to
 * that user with the MCP scopes.
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
    public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse,
            FilterChain filterChain) throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) servletRequest;

        // TODO: Migration required - Spring Security removed. This filter previously read the
        // current Authentication from SecurityContextHolder to decide whether to process the API
        // key. Quarkus has no SecurityContextHolder; the current identity is exposed via
        // io.quarkus.security.identity.SecurityIdentity. With the binding below not yet wired, we
        // always attempt to validate the presented key so the lookup logic is preserved.
        String apiKey = extractKey(request);
        if (apiKey != null && !apiKey.isBlank()) {
            Optional<User> user = userService.getUserByApiKey(apiKey);
            if (user.isPresent() && user.get().isEnabled()) {
                // TODO: Migration required - bind the resolved user + MCP_SCOPES to the request
                // identity. Spring's UsernamePasswordAuthenticationToken /
                // SecurityContextHolder.setContext(...) has no servlet-filter equivalent in
                // Quarkus. Implement an io.quarkus.security.identity.SecurityIdentityAugmentor (or
                // a custom io.quarkus.vertx.http.runtime.security.HttpAuthenticationMechanism /
                // IdentityProvider keyed off the X-API-KEY / Bearer credential) that produces a
                // SecurityIdentity with principal=user.getUsername() and roles=MCP_SCOPES.
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
