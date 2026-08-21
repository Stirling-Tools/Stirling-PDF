package stirling.software.proprietary.security.supabase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

class SupabaseJwtDecoderFactoryTest {

    @Test
    void factoryReturnsFailClosedDecoderWhenIssuerMissing() {
        SupabaseUserLoginProperties props = new SupabaseUserLoginProperties();
        props.setEnabled(true);
        // issuer intentionally not set
        SupabaseJwtDecoderFactory factory = new SupabaseJwtDecoderFactory(props);

        JwtDecoder decoder = factory.supabaseUserLoginJwtDecoder();

        assertThatThrownBy(() -> decoder.decode("any-token"))
                .isInstanceOf(JwtException.class)
                .hasMessageContaining("not configured");
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
}
