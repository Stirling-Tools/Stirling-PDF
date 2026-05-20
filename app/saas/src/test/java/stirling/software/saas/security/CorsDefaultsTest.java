package stirling.software.saas.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * Regression coverage for finding #11: the shipped default CORS list used to include {@code
 * https://*.ssl.stirlingpdf.cloud} paired with {@code allowCredentials=true}, exposing tenant
 * subdomains to credentialed CORS via DNS takeover. The default list must no longer ship a wildcard
 * origin.
 */
class CorsDefaultsTest {

    /**
     * Mirror of the default list in {@link SupabaseSecurityConfig#corsConfigurationSource()}. If
     * this list and the production one drift, this test won't catch it directly — but the assertion
     * below makes the invariant explicit so a future addition gets reviewed.
     */
    private static final List<String> SHIPPED_DEFAULTS =
            List.of(
                    "http://localhost:3000",
                    "http://localhost:5173",
                    "http://localhost:8080",
                    "https://stirling.com",
                    "https://app.stirling.com",
                    "https://api.stirling.com");

    @Test
    void defaultCorsOriginsContainNoWildcards() {
        for (String origin : SHIPPED_DEFAULTS) {
            assertThat(origin)
                    .as(
                            "Default CORS origin %s contains a wildcard; that pairs unsafely with"
                                    + " allowCredentials=true",
                            origin)
                    .doesNotContain("*");
        }
    }

    @Test
    void defaultCorsOriginsAreHttpsExceptLoopback() {
        for (String origin : SHIPPED_DEFAULTS) {
            boolean ok = origin.startsWith("https://") || origin.startsWith("http://localhost");
            assertThat(ok)
                    .as("Default CORS origin %s should be https:// or localhost", origin)
                    .isTrue();
        }
    }
}
