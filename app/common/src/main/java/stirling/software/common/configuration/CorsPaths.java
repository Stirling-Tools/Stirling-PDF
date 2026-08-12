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
     */
    public static final String[] CROSS_ORIGIN_PATTERNS = {
        "/api/**", "/v1/api-docs/**", "/v1/api-docs.yaml", "/swagger-ui/**", "/swagger-ui.html"
    };
}
