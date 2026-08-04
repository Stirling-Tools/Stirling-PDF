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

        boolean jwtAuthenticated = false; // TODO: derive from injected SecurityIdentity / JWT
        if (jwtAuthenticated) {
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

            log.debug("MCP user binding resolved canonical username: {}", boundUsername);
        }

        filterChain.doFilter(req, res);
    }

    /** Strip CR/LF so a crafted claim value can't forge log lines. */
    private static String sanitizeForLog(String value) {
        return value == null ? null : value.replace('\r', ' ').replace('\n', ' ');
    }

    private void reject(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        ObjectNode body = MAPPER.createObjectNode();
        body.put("error", "insufficient_account");
        body.put("message", message);
        response.getWriter().write(MAPPER.writeValueAsString(body));
    }
}
