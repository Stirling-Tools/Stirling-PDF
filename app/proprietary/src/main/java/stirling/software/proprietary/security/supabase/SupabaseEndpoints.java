package stirling.software.proprietary.security.supabase;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import jakarta.enterprise.context.ApplicationScoped;

/**
 * Stirling's customer-facing Supabase project endpoints ({@code auth.stirling.com} in production).
 * Overridable via {@code stirling.supabase.url} / {@code stirling.supabase.publishable-key}.
 */
@ApplicationScoped
public class SupabaseEndpoints {

    public static final String DEFAULT_URL = "https://auth.stirling.com";

    /** Publishable (anon) key — safe to ship in client/server code. */
    public static final String DEFAULT_PUBLISHABLE_KEY =
            "sb_publishable_UHz2SVRF5mvdrPHWkRteyA_yNlZTkYb"; // gitleaks:allow

    @ConfigProperty(name = "stirling.supabase.url", defaultValue = DEFAULT_URL)
    String url;

    @ConfigProperty(
            name = "stirling.supabase.publishable-key",
            defaultValue = DEFAULT_PUBLISHABLE_KEY)
    String publishableKey;

    public String getUrl() {
        return url;
    }

    public String getPublishableKey() {
        return publishableKey;
    }

    /** JWT issuer claim used to validate tokens minted by this project. */
    public String getIssuer() {
        return url + "/auth/v1";
    }

    /** JWKS URL for {@code NimbusJwtDecoder.withJwkSetUri(...)}. */
    public String getJwksUrl() {
        return getIssuer() + "/.well-known/jwks.json";
    }
}
