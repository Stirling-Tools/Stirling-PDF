package stirling.software.proprietary.mcp.security;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

/**
 * API-key auth for the MCP endpoint: validates a Stirling per-user API key and binds the request to
 * that user with the MCP scopes.
 */
@Slf4j
public class McpApiKeyAuthFilter extends OncePerRequestFilter {

    private static final List<GrantedAuthority> MCP_SCOPES =
            List.of(
                    new SimpleGrantedAuthority("SCOPE_mcp.tools.read"),
                    new SimpleGrantedAuthority("SCOPE_mcp.tools.write"));

    private final UserService userService;

    public McpApiKeyAuthFilter(UserService userService) {
        this.userService = userService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        Authentication existing = SecurityContextHolder.getContext().getAuthentication();
        // Treat an anonymous token as not authenticated so the key is still processed.
        boolean unauthenticated =
                existing == null
                        || existing instanceof AnonymousAuthenticationToken
                        || !existing.isAuthenticated();
        if (unauthenticated) {
            String apiKey = extractKey(request);
            if (apiKey != null && !apiKey.isBlank()) {
                Optional<User> user = userService.getUserByApiKey(apiKey);
                if (user.isPresent() && user.get().isEnabled()) {
                    UsernamePasswordAuthenticationToken auth =
                            new UsernamePasswordAuthenticationToken(
                                    user.get().getUsername(), null, MCP_SCOPES);
                    SecurityContext context = SecurityContextHolder.createEmptyContext();
                    context.setAuthentication(auth);
                    SecurityContextHolder.setContext(context);
                } else {
                    log.warn(
                            "MCP access denied: presented API key did not match an active account");
                }
            }
        }
        filterChain.doFilter(request, response);
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
