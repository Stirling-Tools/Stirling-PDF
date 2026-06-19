package stirling.software.proprietary.mcp.security;

import java.io.IOException;
import java.util.Optional;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
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
 *
 * <p>TODO: Migration required - this was a Spring Security {@code OncePerRequestFilter} that read
 * and rewrote the {@code SecurityContextHolder} ({@code JwtAuthenticationToken}/{@code Jwt}).
 * Quarkus has no global mutable security context; the canonical replacement is a {@code
 * io.quarkus.security.identity.SecurityIdentityAugmentor} that runs after quarkus-oidc/
 * quarkus-smallrye-jwt validates the bearer token, reads the username claim from the {@code
 * JsonWebToken}, looks up the Stirling account via {@link UserService}, and rebuilds the {@code
 * SecurityIdentity} with the canonical principal name while preserving the original scope roles.
 * The account-lookup and reject logic below is preserved; only the identity read/rebind and the
 * request rejection plumbing still need to be wired to the augmentor (or to a {@code
 * jakarta.ws.rs.container.ContainerRequestFilter @Provider} that aborts with 403). Until then this
 * filter passes every request through unchanged.
 */
@Slf4j
public class McpUserBindingFilter implements Filter {

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
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain filterChain)
            throws ServletException, IOException {
        HttpServletResponse response = (HttpServletResponse) res;

        // TODO: Migration required - extract the validated JWT and its claims from the Quarkus
        // SecurityIdentity / JsonWebToken instead of Spring's SecurityContextHolder. The block
        // below preserves the original binding logic but cannot run until that wiring exists, so
        // for now every request passes through untouched.
        boolean jwtAuthenticated = false; // TODO: derive from injected SecurityIdentity / JWT
        if (jwtAuthenticated) {
            // TODO: Migration required - read the claim value from the validated token, e.g.
            // jsonWebToken.getClaim(usernameClaim). Placeholder keeps the surrounding logic intact.
            String username = null; // TODO: jwt.getClaim(usernameClaim)

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

            // TODO: Migration required - rebind to the Stirling username, carrying only the OAuth
            // scope authorities. With quarkus-oidc/smallrye-jwt this is done by a
            // SecurityIdentityAugmentor that returns a new SecurityIdentity whose principal name is
            // boundUsername and whose roles are the original token scopes. boundUsername is
            // computed
            // above and ready to feed into that augmentor.
            log.debug("MCP user binding resolved canonical username: {}", boundUsername);
        }

        filterChain.doFilter(req, res);
    }

    /** Strip CR/LF so a crafted claim value can't forge log lines. */
    private static String sanitizeForLog(String value) {
        return value == null ? null : value.replace('\r', ' ').replace('\n', ' ');
    }

    private void reject(HttpServletResponse response, String message) throws IOException {
        // TODO: Migration required - on the Quarkus path, rejection should clear/deny the
        // SecurityIdentity (augmentor throws AuthenticationFailedException) or the
        // ContainerRequestFilter should abortWith(Response.status(403)...). The 403 JSON body below
        // is preserved as the intended response shape.
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        ObjectNode body = MAPPER.createObjectNode();
        body.put("error", "insufficient_account");
        body.put("message", message);
        response.getWriter().write(MAPPER.writeValueAsString(body));
    }
}
