package stirling.software.proprietary.mcp.security;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * RFC 8707 audience binding: a JWT at the MCP endpoint must list this server's resource id (or one
 * of the explicitly accepted additional audiences) in its {@code aud} claim. The additional list
 * exists for IdPs that cannot mint resource-specific audiences - e.g. Supabase's OAuth server
 * always issues {@code aud=authenticated}. Fails closed when nothing is configured.
 */
public class McpAudienceValidator implements OAuth2TokenValidator<Jwt> {

    private final Set<String> acceptedAudiences;

    public McpAudienceValidator(String expectedResourceId) {
        this(expectedResourceId, List.of());
    }

    public McpAudienceValidator(String expectedResourceId, Collection<String> additionalAudiences) {
        Set<String> accepted = new LinkedHashSet<>();
        if (expectedResourceId != null && !expectedResourceId.isBlank()) {
            accepted.add(expectedResourceId);
        }
        if (additionalAudiences != null) {
            additionalAudiences.stream()
                    .filter(a -> a != null && !a.isBlank())
                    .forEach(accepted::add);
        }
        this.acceptedAudiences = accepted;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
        if (acceptedAudiences.isEmpty()) {
            return OAuth2TokenValidatorResult.failure(
                    new OAuth2Error(
                            "invalid_token",
                            "MCP audience binding is not configured; rejecting all tokens until"
                                    + " mcp.auth.resource-id or mcp.auth.accepted-audiences is set.",
                            null));
        }
        List<String> aud = token.getAudience();
        if (aud == null || aud.stream().noneMatch(acceptedAudiences::contains)) {
            return OAuth2TokenValidatorResult.failure(
                    new OAuth2Error(
                            "invalid_token",
                            "Token audience does not include this server's resource id or an"
                                    + " accepted audience ("
                                    + String.join(", ", acceptedAudiences)
                                    + ").",
                            null));
        }
        return OAuth2TokenValidatorResult.success();
    }
}
