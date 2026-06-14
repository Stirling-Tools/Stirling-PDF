package stirling.software.proprietary.security.supabase;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Field;

import org.junit.jupiter.api.Test;

/**
 * MIGRATION (Spring -> Quarkus): {@code SupabaseJwtDecoderFactory} no longer produces a Spring
 * Security {@code org.springframework.security.oauth2.jwt.JwtDecoder} (Quarkus has no {@code
 * JwtDecoder} abstraction; bearer verification is wired via quarkus-oidc / smallrye-jwt). The
 * fail-closed contract is now expressed by {@link SupabaseJwtDecoderFactory#jwksUri()} returning
 * {@code null} when no issuer is configured (so token verification must reject every token). The
 * {@code properties} collaborator is field-injected, so it is set by reflection here.
 */
class SupabaseJwtDecoderFactoryTest {

    @Test
    void jwksUriIsNullWhenIssuerMissing_failClosed() throws Exception {
        SupabaseUserLoginProperties props = new SupabaseUserLoginProperties();
        props.setEnabled(true);
        // issuer intentionally not set
        SupabaseJwtDecoderFactory factory = factoryWith(props);

        assertThat(factory.jwksUri()).isNull();
    }

    @Test
    void jwksUriIsComputedFromIssuerWhenConfigured() throws Exception {
        SupabaseUserLoginProperties props = new SupabaseUserLoginProperties();
        props.setEnabled(true);
        props.setIssuer("https://example.supabase.co/auth/v1");
        SupabaseJwtDecoderFactory factory = factoryWith(props);

        assertThat(factory.jwksUri())
                .isEqualTo("https://example.supabase.co/auth/v1/.well-known/jwks.json");
    }

    @Test
    void jwtConfiguredReflectsBothEnabledAndIssuer() {
        SupabaseUserLoginProperties props = new SupabaseUserLoginProperties();

        assertThat(props.isJwtConfigured()).isFalse();

        props.setEnabled(true);
        assertThat(props.isJwtConfigured()).isFalse();

        props.setIssuer("https://example.supabase.co/auth/v1");
        assertThat(props.isJwtConfigured()).isTrue();

        props.setEnabled(false);
        assertThat(props.isJwtConfigured()).isFalse();
    }

    @Test
    void blankIssuerCountsAsUnconfigured() {
        SupabaseUserLoginProperties props = new SupabaseUserLoginProperties();
        props.setEnabled(true);
        props.setIssuer("   ");
        assertThat(props.isJwtConfigured()).isFalse();
    }

    private static SupabaseJwtDecoderFactory factoryWith(SupabaseUserLoginProperties props)
            throws Exception {
        SupabaseJwtDecoderFactory factory = new SupabaseJwtDecoderFactory();
        Field f = SupabaseJwtDecoderFactory.class.getDeclaredField("properties");
        f.setAccessible(true);
        f.set(factory, props);
        return factory;
    }
}
