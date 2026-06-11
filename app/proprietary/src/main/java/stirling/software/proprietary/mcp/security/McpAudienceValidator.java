package stirling.software.proprietary.mcp.security;

import java.util.List;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * RFC 8707 audience binding: a JWT at the MCP endpoint must list this server's resource id in its
 * {@code aud} claim. Fails closed when the resource id is unset.
 */
public class McpAudienceValidator implements OAuth2TokenValidator<Jwt> {

    private final String expectedResourceId;

    public McpAudienceValidator(String expectedResourceId) {
        this.expectedResourceId = expectedResourceId == null ? "" : expectedResourceId;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
        if (expectedResourceId.isBlank()) {
            return OAuth2TokenValidatorResult.failure(
                    new OAuth2Error(
                            "invalid_token",
                            "MCP server has no resource id configured; rejecting all tokens"
                                    + " until mcp.auth.resource-id is set.",
                            null));
        }
        List<String> aud = token.getAudience();
        if (aud == null || !aud.contains(expectedResourceId)) {
            return OAuth2TokenValidatorResult.failure(
                    new OAuth2Error(
                            "invalid_token",
                            "Token audience does not include this server's resource id ("
                                    + expectedResourceId
                                    + ").",
                            null));
        }
        return OAuth2TokenValidatorResult.success();
    }
}
