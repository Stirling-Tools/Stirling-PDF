package stirling.software.proprietary.security.supabase;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Produces a {@link JwtDecoder} bean for the proprietary Supabase login path. Only registered when
 * {@code security.supabase.user-login.enabled=true}.
 */
@Slf4j
@Configuration
@ConditionalOnProperty(
        prefix = "security.supabase.user-login",
        name = "enabled",
        havingValue = "true")
@RequiredArgsConstructor
public class SupabaseJwtDecoderFactory {

    private final SupabaseUserLoginProperties properties;

    @Bean
    public JwtDecoder supabaseUserLoginJwtDecoder() {
        if (!properties.isJwtConfigured()) {
            log.warn(
                    "security.supabase.user-login.enabled=true but issuer URL is not set;"
                            + " producing a fail-closed JwtDecoder that rejects every token."
                            + " Set security.supabase.user-login.issuer to enable real verification.");
            return token -> {
                throw new org.springframework.security.oauth2.jwt.JwtException(
                        "Supabase user-login issuer not configured");
            };
        }
        String jwks = properties.getIssuer() + "/.well-known/jwks.json";
        log.info("Configuring proprietary-mode Supabase JwtDecoder with JWKS: {}", jwks);
        return NimbusJwtDecoder.withJwkSetUri(jwks).build();
    }
}
