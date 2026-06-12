package stirling.software.proprietary.security.supabase;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.Data;

/** Config for the optional Supabase login on proprietary deployments. */
// TODO: Migration required - this was a Spring @ConfigurationProperties(prefix =
// "security.supabase.user-login") POJO. Rebind the prefixed properties via
// @io.smallrye.config.ConfigMapping(prefix = "security.supabase.user-login") (interface-based)
// so the fields are populated from configuration; until then this bean holds defaults only.
@Data
@ApplicationScoped
public class SupabaseUserLoginProperties {

    /** Master switch. */
    private boolean enabled = false;

    /** Supabase project issuer URL, e.g. {@code https://abcd1234.supabase.co/auth/v1}. */
    private String issuer;

    /** Optional expected JWT audience; empty disables aud validation. */
    private String expectedAud;

    /** Clock skew tolerance for JWT exp validation. */
    private long clockSkewSeconds = 120L;

    /** When true, a Supabase JWT for an unknown email auto-creates a local user. */
    private boolean autoCreate = false;

    public boolean isJwtConfigured() {
        return enabled && issuer != null && !issuer.isBlank();
    }
}
