package stirling.software.proprietary.security.supabase;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Stirling's customer-facing Supabase project endpoints ({@code auth.stirling.com} in production).
 * Overridable via {@code stirling.supabase.url} / {@code stirling.supabase.publishable-key}.
 */
@Component
public class SupabaseEndpoints {

    public static final String DEFAULT_URL = "https://auth.stirling.com";

    /** Publishable (anon) key — safe to ship in client/server code. */
    public static final String DEFAULT_PUBLISHABLE_KEY =
            "sb_publishable_UHz2SVRF5mvdrPHWkRteyA_yNlZTkYb"; // gitleaks:allow

    @Value("${stirling.supabase.url:" + DEFAULT_URL + "}")
    private String url;

    @Value("${stirling.supabase.publishable-key:" + DEFAULT_PUBLISHABLE_KEY + "}")
    private String publishableKey;

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
