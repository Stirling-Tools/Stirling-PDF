package stirling.software.proprietary.mcp.security;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * RFC 8707 audience binding: a JWT at the MCP endpoint must list this server's resource id (or one
 * of the explicitly accepted additional audiences) in its {@code aud} claim. The additional list
 * exists for IdPs that cannot mint resource-specific audiences - e.g. Supabase's OAuth server
 * always issues {@code aud=authenticated}. Fails closed when nothing is configured.
 */
public class McpAudienceValidator {

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

    /**
     * Validates that the supplied token audience claim contains this server's resource id or an
     * accepted audience.
     *
     * @param audience the {@code aud} claim values from the JWT
     * @return a result describing success or the failure reason
     */
    public Result validate(List<String> audience) {
        if (acceptedAudiences.isEmpty()) {
            return Result.failure(
                    "invalid_token",
                    "MCP audience binding is not configured; rejecting all tokens until"
                            + " mcp.auth.resource-id or mcp.auth.accepted-audiences is set.");
        }
        if (audience == null || audience.stream().noneMatch(acceptedAudiences::contains)) {
            return Result.failure(
                    "invalid_token",
                    "Token audience does not include this server's resource id or an accepted"
                            + " audience ("
                            + String.join(", ", acceptedAudiences)
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
