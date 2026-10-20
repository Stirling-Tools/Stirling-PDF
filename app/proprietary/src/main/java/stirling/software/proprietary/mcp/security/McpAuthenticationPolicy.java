package stirling.software.proprietary.mcp.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import stirling.software.proprietary.security.model.User;

/** Deployment-specific identity binding and account restrictions applied before MCP tool access. */
public interface McpAuthenticationPolicy {
    /**
     * Binds a validated MCP token to its canonical user or throws AccessDeniedException. Return a
     * JWT authentication only when its bearer token is also trusted by the local tool API.
     */
    Authentication bindJwt(JwtAuthenticationToken authentication);

    /** Throws AccessDeniedException when an enabled account cannot use a personal API key. */
    void assertApiKeyAccess(User user);
}
