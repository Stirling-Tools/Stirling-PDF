package stirling.software.common.configuration;

import lombok.experimental.UtilityClass;

/**
 * URL patterns that are eligible for cross-origin (CORS) access.
 *
 * <p>This single source of truth is shared by the MVC registry ({@code WebMvcConfig}) and both
 * security-layer {@code CorsConfigurationSource}s so all three layers stay in lockstep.
 */
@UtilityClass
public class CorsPaths {

    /**
     * The app serves its OpenAPI document at {@code /v1/api-docs} ({@code
     * springdoc.api-docs.path=/v1/api-docs}) rather than springdoc's default {@code /v3/api-docs}.
     * {@code /v1/api-docs.yaml} is a sibling of {@code /v1/api-docs/**}, so it must be listed
     * explicitly.
     *
     * <p>{@code /mcp/**} covers the Streamable-HTTP MCP endpoint ({@code POST /mcp}), which
     * browser-based MCP clients call with {@code fetch}, plus its OAuth protected-resource metadata
     * at {@code /.well-known/oauth-protected-resource}. OAuth2 login and callback paths ({@code
     * /oauth2/**}, {@code /login/oauth2/code/**}) stay excluded on purpose: that flow runs through
     * top-level browser navigation rather than {@code fetch}, so CORS headers would only widen the
     * attack surface of the credentialed mapping.
     */
    public static final String[] CROSS_ORIGIN_PATTERNS = {
        "/api/**",
        "/v1/api-docs/**",
        "/v1/api-docs.yaml",
        "/swagger-ui/**",
        "/swagger-ui.html",
        "/mcp/**",
        "/.well-known/oauth-protected-resource/**"
    };
}
