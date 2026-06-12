package stirling.software.saas.config;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;

/** Supabase configuration ({@code app.supabase.*}) for saas mode. */
// TODO: Migration required - @ConfigurationProperties(prefix="app.supabase"); bind via
// @ConfigProperty or @ConfigMapping
@Slf4j
@Data
@ApplicationScoped
@IfBuildProfile("saas")
public class SupabaseConfigurationProperties {

    /** Supabase project issuer URL, e.g. {@code https://abcd1234.supabase.co/auth/v1}. */
    private String issuer;

    /** Optional expected JWT audience. Empty string disables aud validation. */
    private String expectedAud;

    /** Clock skew tolerance for JWT exp validation. */
    private long clockSkewSeconds = 120L;

    /** Edge Function URL for server→Supabase admin calls (optional). */
    private String edgeFunctionUrl;

    /** Edge Function shared secret for authenticated server→Supabase admin calls. */
    private String edgeFunctionSecret;

    /** True when JWT verification can run (issuer URL set so JWKS can be fetched). */
    public boolean isJwtConfigured() {
        return issuer != null && !issuer.isBlank();
    }

    /** True when server→Supabase Edge Function calls can run (URL + shared secret set). */
    public boolean isEdgeFunctionConfigured() {
        return edgeFunctionUrl != null
                && !edgeFunctionUrl.isBlank()
                && edgeFunctionSecret != null
                && !edgeFunctionSecret.isBlank();
    }
}
