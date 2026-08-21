package stirling.software.proprietary.mcp.security;

import java.io.IOException;
import java.util.Optional;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Binds an MCP-validated JWT to a provisioned Stirling user: optionally rejects subjects with no
 * enabled account, then rebinds the principal to the canonical Stirling username (scope authorities
 * only) so audit/metering attribute correctly.
 */
@Slf4j
public class McpUserBindingFilter extends OncePerRequestFilter {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final UserService userService;
    private final String usernameClaim;
    private final boolean requireExistingAccount;

    public McpUserBindingFilter(
            UserService userService, String usernameClaim, boolean requireExistingAccount) {
        this.userService = userService;
        this.usernameClaim =
                (usernameClaim == null || usernameClaim.isBlank()) ? "sub" : usernameClaim;
        this.requireExistingAccount = requireExistingAccount;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        Authentication current = SecurityContextHolder.getContext().getAuthentication();

        // Only act on a JWT-authenticated request; everything else passes through.
        if (current instanceof JwtAuthenticationToken jwtAuth && jwtAuth.isAuthenticated()) {
            Jwt jwt = jwtAuth.getToken();
            String username = jwt.getClaimAsString(usernameClaim);

            if (username == null || username.isBlank()) {
                reject(
                        response,
                        "Token is missing the '"
                                + usernameClaim
                                + "' claim used to map to a"
                                + " Stirling user.");
                return;
            }

            // Prefer the canonical username from the account record; fall back to the claim when
            // binding is off.
            String boundUsername = username;
            if (requireExistingAccount) {
                Optional<User> account = userService.findByUsernameIgnoreCase(username);
                if (account.isEmpty() || !account.get().isEnabled()) {
                    log.warn(
                            "MCP access denied: token subject '{}' has no active Stirling account",
                            sanitizeForLog(username));
                    reject(
                            response,
                            "MCP access requires a provisioned, enabled Stirling account for this"
                                    + " subject.");
                    return;
                }
                boundUsername = account.get().getUsername();
            }

            // Rebind to the Stirling username, carrying only the OAuth scope authorities.
            UsernamePasswordAuthenticationToken bound =
                    new UsernamePasswordAuthenticationToken(
                            boundUsername, null, jwtAuth.getAuthorities());
            bound.setDetails(jwtAuth.getDetails());
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(bound);
            SecurityContextHolder.setContext(context);
        }

        filterChain.doFilter(request, response);
    }

    /** Strip CR/LF so a crafted claim value can't forge log lines. */
    private static String sanitizeForLog(String value) {
        return value == null ? null : value.replace('\r', ' ').replace('\n', ' ');
    }

    private void reject(HttpServletResponse response, String message) throws IOException {
        SecurityContextHolder.clearContext();
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        ObjectNode body = MAPPER.createObjectNode();
        body.put("error", "insufficient_account");
        body.put("message", message);
        response.getWriter().write(MAPPER.writeValueAsString(body));
    }
}
