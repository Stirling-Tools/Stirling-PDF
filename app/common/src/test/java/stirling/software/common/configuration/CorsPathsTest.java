package stirling.software.common.configuration;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("CorsPaths cross-origin pattern allowlist")
class CorsPathsTest {

    @Test
    @DisplayName("allowlist contains exactly the API, docs, UI, and MCP surfaces")
    void allowlistMatchesExpectedSurfaces() {
        assertArrayEquals(
                new String[] {
                    "/api/**",
                    "/v1/api-docs/**",
                    "/v1/api-docs.yaml",
                    "/swagger-ui/**",
                    "/swagger-ui.html",
                    "/mcp/**",
                    "/.well-known/oauth-protected-resource/**"
                },
                CorsPaths.CROSS_ORIGIN_PATTERNS);
    }

    @Test
    @DisplayName("OAuth2 login and callback paths stay excluded from credentialed CORS")
    void oauthLoginPathsStayExcluded() {
        assertTrue(
                Arrays.stream(CorsPaths.CROSS_ORIGIN_PATTERNS)
                        .noneMatch(
                                pattern ->
                                        pattern.contains("/oauth2/")
                                                || pattern.contains("/login/oauth2/")),
                "login and callback flows use top-level navigation, not fetch");
    }
}
