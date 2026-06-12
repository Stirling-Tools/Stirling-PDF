package stirling.software.proprietary.mcp.security;

import java.util.List;

/**
 * RFC 8707 audience binding: a JWT at the MCP endpoint must list this server's resource id in its
 * {@code aud} claim. Fails closed when the resource id is unset.
 *
 * <p>TODO: Migration required - this was a Spring Security
 * {@code OAuth2TokenValidator<Jwt>}. Quarkus-oidc has no equivalent validator SPI; the standard way
 * to enforce audience binding is configuration:
 * {@code quarkus.oidc.token.audience=<resource-id>} (combined with
 * {@code mp.jwt.verify.audiences} for smallrye-jwt). The fail-closed behaviour when no resource id
 * is configured must be reproduced either by making that config mandatory or by augmenting the
 * {@code io.quarkus.security.identity.SecurityIdentity} via a
 * {@code SecurityIdentityAugmentor}. The pure audience-check logic below is preserved so it can be
 * invoked from such an augmentor or a custom {@code jakarta.ws.rs.container.ContainerRequestFilter}.
 */
public class McpAudienceValidator {

    private final String expectedResourceId;

    public McpAudienceValidator(String expectedResourceId) {
        this.expectedResourceId = expectedResourceId == null ? "" : expectedResourceId;
    }

    /**
     * Validates that the supplied token audience claim contains this server's resource id.
     *
     * @param audience the {@code aud} claim values from the JWT
     * @return a result describing success or the failure reason
     */
    public Result validate(List<String> audience) {
        if (expectedResourceId.isBlank()) {
            return Result.failure(
                    "invalid_token",
                    "MCP server has no resource id configured; rejecting all tokens"
                            + " until mcp.auth.resource-id is set.");
        }
        if (audience == null || !audience.contains(expectedResourceId)) {
            return Result.failure(
                    "invalid_token",
                    "Token audience does not include this server's resource id ("
                            + expectedResourceId
                            + ").");
        }
        return Result.success();
    }

    /** Outcome of an audience validation, replacing Spring's OAuth2TokenValidatorResult. */
    public record Result(boolean valid, String errorCode, String description) {
        static Result success() {
            return new Result(true, null, null);
        }

        static Result failure(String errorCode, String description) {
            return new Result(false, errorCode, description);
        }
    }
}
