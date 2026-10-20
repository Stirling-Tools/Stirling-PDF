package stirling.software.saas.sso;

import java.util.UUID;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.security.McpAuthenticationPolicy;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.security.EnhancedJwtAuthenticationToken;

/** SaaS MCP binds a trusted Supabase subject and enforces the same company policy as the API. */
@Component
@Profile("saas")
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class SaasMcpAuthenticationPolicy implements McpAuthenticationPolicy {
    private final JwtDecoder supabaseDecoder;
    private final UserRepository users;
    private final CompanySsoPolicy companySso;

    public SaasMcpAuthenticationPolicy(
            @Qualifier("jwtDecoder") JwtDecoder supabaseDecoder,
            UserRepository users,
            CompanySsoPolicy companySso) {
        this.supabaseDecoder = supabaseDecoder;
        this.users = users;
        this.companySso = companySso;
    }

    @Override
    public Authentication bindJwt(JwtAuthenticationToken authentication) {
        try {
            // MCP may trust another issuer; only the application's Supabase decoder can authorize
            // a SaaS identity, regardless of configurable username claims or account-binding flags.
            Jwt jwt = supabaseDecoder.decode(authentication.getToken().getTokenValue());
            if (!"authenticated".equals(jwt.getClaimAsString("role"))
                    || jwt.getAudience() == null
                    || !jwt.getAudience().contains("authenticated")
                    || Boolean.TRUE.equals(jwt.getClaimAsBoolean("is_anonymous"))
                    || jwt.getSubject() == null
                    || jwt.getClaimAsString("session_id") == null) {
                throw denied();
            }
            UUID authId = UUID.fromString(jwt.getSubject());
            UUID.fromString(jwt.getClaimAsString("session_id"));
            User user =
                    companySso
                            .resolve(jwt)
                            .orElseGet(
                                    () ->
                                            users.findBySupabaseId(authId)
                                                    .orElseThrow(
                                                            SaasMcpAuthenticationPolicy::denied));
            if (!user.isEnabled()) throw denied();
            companySso.assertAccess(user, jwt);
            var bound =
                    new EnhancedJwtAuthenticationToken(
                            jwt,
                            authentication.getAuthorities(),
                            user.getUsername(),
                            user.getSupabaseId().toString(),
                            user);
            bound.setDetails(authentication.getDetails());
            return bound;
        } catch (CompanySsoException e) {
            throw new AccessDeniedException(e.getMessage(), e);
        } catch (JwtException | IllegalArgumentException e) {
            throw denied();
        }
    }

    @Override
    public void assertApiKeyAccess(User user) {
        try {
            companySso.assertAccess(user, null);
        } catch (CompanySsoException e) {
            throw new AccessDeniedException(e.getMessage(), e);
        }
    }

    private static AccessDeniedException denied() {
        return new AccessDeniedException(
                "MCP access requires an enabled Stirling account and a valid Supabase user session.");
    }
}
