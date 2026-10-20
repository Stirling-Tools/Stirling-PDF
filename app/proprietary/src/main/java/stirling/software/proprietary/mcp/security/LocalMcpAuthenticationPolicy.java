package stirling.software.proprietary.mcp.security;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

/** Self-hosted MCP uses the configured username claim and optional existing-account requirement. */
final class LocalMcpAuthenticationPolicy implements McpAuthenticationPolicy {
    private final UserService users;
    private final ApplicationProperties.Mcp.Auth settings;

    LocalMcpAuthenticationPolicy(UserService users, ApplicationProperties.Mcp.Auth settings) {
        this.users = users;
        this.settings = settings;
    }

    @Override
    public Authentication bindJwt(JwtAuthenticationToken authentication) {
        String claim = settings.getUsernameClaim();
        if (claim == null || claim.isBlank()) claim = "sub";
        String username = authentication.getToken().getClaimAsString(claim);
        if (username == null || username.isBlank()) {
            throw new AccessDeniedException(
                    "Token is missing the '" + claim + "' claim used to map to a Stirling user.");
        }
        if (settings.isRequireExistingAccount()) {
            username =
                    users.findByUsernameIgnoreCase(username)
                            .filter(User::isEnabled)
                            .map(User::getUsername)
                            .orElseThrow(
                                    () ->
                                            new AccessDeniedException(
                                                    "MCP access requires a provisioned, enabled Stirling account for this subject."));
        }
        var bound =
                new UsernamePasswordAuthenticationToken(
                        username, null, authentication.getAuthorities());
        bound.setDetails(authentication.getDetails());
        return bound;
    }

    @Override
    public void assertApiKeyAccess(User user) {}
}
