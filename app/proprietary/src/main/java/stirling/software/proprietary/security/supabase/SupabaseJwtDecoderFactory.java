package stirling.software.proprietary.security.supabase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import lombok.extern.slf4j.Slf4j;

/**
 * Produces the JWKS configuration for the proprietary Supabase login path. Only relevant when
 * {@code security.supabase.user-login.enabled=true}.
 *
 * <p>TODO: Migration required - this class previously produced a Spring Security {@code
 * org.springframework.security.oauth2.jwt.JwtDecoder} bean (Nimbus-based) via
 * {@code @Configuration}/{@code @Bean}, conditionally registered with
 * {@code @ConditionalOnProperty(security.supabase.user-login.enabled=true)}. Quarkus has no {@code
 * JwtDecoder} abstraction; bearer/JWT validation for the Supabase issuer must be wired via
 * quarkus-oidc (resource-server) using {@code quarkus.oidc.<tenant>.auth-server-url}/ {@code
 * quarkus.oidc.<tenant>.jwks-path}, or via quarkus-smallrye-jwt ({@code
 * mp.jwt.verify.publickey.location} pointing at the JWKS URL computed by {@link #jwksUri()}). The
 * conditional registration becomes a build/runtime profile guard (e.g.
 * {@code @io.quarkus.arc.profile.IfBuildProfile} or a {@code quarkus.oidc.<tenant>.tenant-enabled}
 * runtime toggle). The fail-closed behaviour (reject every token when the issuer is unset) must be
 * reproduced at the tenant-resolution / IdentityProvider layer. The JWKS-URL helper logic below is
 * preserved for reuse during that wiring.
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
