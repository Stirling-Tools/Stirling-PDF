package stirling.software.proprietary.security.supabase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import lombok.extern.slf4j.Slf4j;

/**
 * Produces the JWKS configuration for the proprietary Supabase login path. Only relevant when
 * {@code security.supabase.user-login.enabled=true}.
 */
@Slf4j
@ApplicationScoped
public class SupabaseJwtDecoderFactory {

    @Inject SupabaseUserLoginProperties properties;

    /**
     * Computes the Supabase JWKS endpoint, or returns {@code null} when no issuer is configured (in
     * which case token verification must fail closed - reject every token).
     */
    public String jwksUri() {
        if (!properties.isJwtConfigured()) {
            log.warn(
                    "security.supabase.user-login.enabled=true but issuer URL is not set;"
                            + " token verification must fail closed and reject every token."
                            + " Set security.supabase.user-login.issuer to enable real verification.");
            return null;
        }
        String jwks = properties.getIssuer() + "/.well-known/jwks.json";
        log.info("Configuring proprietary-mode Supabase JWKS: {}", jwks);
        return jwks;
    }
}
