package stirling.software.saas.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.service.SaasTeamService;
import stirling.software.saas.service.SupabaseUserService;

/**
 * Additional branch coverage for {@link SupabaseSecurityConfig}: validateIssuer, jwtDecoder
 * fail-closed and happy paths, corsConfigurationSource defaults vs operator override, and the
 * security filter chain bean wiring.
 */
@ExtendWith(MockitoExtension.class)
class SupabaseSecurityConfigMoreTest {

    @Mock private UserService userService;
    @Mock private TeamService teamService;
    @Mock private SupabaseUserService supabaseUserService;
    @Mock private SaasTeamService saasTeamService;

    private SupabaseSecurityConfig config(ApplicationProperties props) {
        return new SupabaseSecurityConfig(
                userService, teamService, supabaseUserService, saasTeamService, props);
    }

    @Nested
    @DisplayName("validateIssuer")
    class ValidateIssuer {

        @Test
        @DisplayName("null issuer reports unset")
        void nullIssuer() {
            assertThat(SupabaseSecurityConfig.validateIssuer(null)).contains("is not set");
        }

        @Test
        @DisplayName("blank issuer reports unset")
        void blankIssuer() {
            assertThat(SupabaseSecurityConfig.validateIssuer("   ")).contains("is not set");
        }

        @Test
        @DisplayName("invalid URI is rejected")
        void invalidUri() {
            assertThat(SupabaseSecurityConfig.validateIssuer("ht tp://bad uri"))
                    .contains("not a valid URI");
        }

        @Test
        @DisplayName("empty host is rejected (project ref unset)")
        void emptyHost() {
            // No authority component -> host is null.
            assertThat(SupabaseSecurityConfig.validateIssuer("https:///auth/v1"))
                    .contains("empty host");
        }

        @Test
        @DisplayName("host starting with a dot is rejected")
        void dottedHost() {
            assertThat(SupabaseSecurityConfig.validateIssuer("https://.supabase.co/auth/v1"))
                    .contains("empty host");
        }

        @Test
        @DisplayName("non-http(s) scheme is rejected")
        void nonHttpScheme() {
            assertThat(SupabaseSecurityConfig.validateIssuer("ftp://host/auth/v1"))
                    .contains("must be http(s)");
        }

        @Test
        @DisplayName("valid https issuer returns null")
        void validHttps() {
            assertThat(SupabaseSecurityConfig.validateIssuer("https://proj.supabase.co/auth/v1"))
                    .isNull();
        }

        @Test
        @DisplayName("valid http issuer returns null")
        void validHttp() {
            assertThat(SupabaseSecurityConfig.validateIssuer("http://localhost:9999/auth/v1"))
                    .isNull();
        }
    }

    @Nested
    @DisplayName("jwtDecoder bean")
    class JwtDecoderBean {

        @Test
        @DisplayName("fail-closed decoder rejects every token when issuer is unset")
        void failClosedRejectsAllTokens() {
            SupabaseSecurityConfig cfg = config(new ApplicationProperties());
            ReflectionTestUtils.setField(cfg, "issuer", "");
            ReflectionTestUtils.setField(cfg, "expectedAud", "");
            ReflectionTestUtils.setField(cfg, "clockSkewSeconds", 120L);

            JwtDecoder decoder = cfg.jwtDecoder();

            assertThatThrownBy(() -> decoder.decode("anything"))
                    .isInstanceOf(JwtException.class)
                    .hasMessageContaining("is not set");
        }

        @Test
        @DisplayName("valid issuer builds a real Nimbus decoder (aud disabled branch)")
        void validIssuerBuildsDecoderNoAud() {
            SupabaseSecurityConfig cfg = config(new ApplicationProperties());
            ReflectionTestUtils.setField(cfg, "issuer", "https://proj.supabase.co/auth/v1");
            ReflectionTestUtils.setField(cfg, "expectedAud", "");
            ReflectionTestUtils.setField(cfg, "clockSkewSeconds", 60L);

            JwtDecoder decoder = cfg.jwtDecoder();

            // No JWKS fetch happens until a token is decoded, so simply building is enough.
            assertThat(decoder).isNotNull();
        }

        @Test
        @DisplayName("valid issuer with expected aud builds a decoder (aud enabled branch)")
        void validIssuerBuildsDecoderWithAud() {
            SupabaseSecurityConfig cfg = config(new ApplicationProperties());
            ReflectionTestUtils.setField(cfg, "issuer", "https://proj.supabase.co/auth/v1");
            ReflectionTestUtils.setField(cfg, "expectedAud", "authenticated");
            ReflectionTestUtils.setField(cfg, "clockSkewSeconds", 90L);

            JwtDecoder decoder = cfg.jwtDecoder();

            assertThat(decoder).isNotNull();
        }
    }

    @Nested
    @DisplayName("corsConfigurationSource")
    class Cors {

        private CorsConfiguration cors(CorsConfigurationSource source) {
            UrlBasedCorsConfigurationSource ub = (UrlBasedCorsConfigurationSource) source;
            return ub.getCorsConfigurations().get("/**");
        }

        @Test
        @DisplayName(
                "default origins include the shipped localhost + stirling hosts and credentials")
        void defaultOriginsUsed() {
            CorsConfigurationSource source =
                    config(new ApplicationProperties()).corsConfigurationSource();
            CorsConfiguration cfg = cors(source);

            assertThat(cfg.getAllowedOriginPatterns())
                    .contains("https://stirling.com", "http://localhost:3000");
            assertThat(cfg.getAllowCredentials()).isTrue();
            assertThat(cfg.getMaxAge()).isEqualTo(3600L);
            assertThat(cfg.getExposedHeaders()).contains("WWW-Authenticate");
        }

        @Test
        @DisplayName("desktop tauri origins are always appended exactly once")
        void desktopOriginsAppended() {
            CorsConfigurationSource source =
                    config(new ApplicationProperties()).corsConfigurationSource();
            CorsConfiguration cfg = cors(source);

            assertThat(cfg.getAllowedOriginPatterns())
                    .contains(
                            "tauri://localhost",
                            "http://tauri.localhost",
                            "https://tauri.localhost");
            assertThat(cfg.getAllowedOriginPatterns().stream().filter("tauri://localhost"::equals))
                    .hasSize(1);
        }

        @Test
        @DisplayName("operator override replaces the default origin list")
        void operatorOverrideUsed() {
            ApplicationProperties props = new ApplicationProperties();
            props.getSystem().setCorsAllowedOrigins(List.of("https://custom.example.com"));

            CorsConfiguration cfg = cors(config(props).corsConfigurationSource());

            assertThat(cfg.getAllowedOriginPatterns())
                    .contains("https://custom.example.com")
                    // The shipped default hosts are not present when overridden.
                    .doesNotContain("https://stirling.com");
        }

        @Test
        @DisplayName("operator override already containing a desktop origin is not duplicated")
        void operatorOverrideWithDesktopOriginNotDuplicated() {
            ApplicationProperties props = new ApplicationProperties();
            props.getSystem()
                    .setCorsAllowedOrigins(
                            List.of("https://custom.example.com", "tauri://localhost"));

            CorsConfiguration cfg = cors(config(props).corsConfigurationSource());

            assertThat(cfg.getAllowedOriginPatterns().stream().filter("tauri://localhost"::equals))
                    .hasSize(1);
        }

        @Test
        @DisplayName("wildcard origin in override still configures (warning branch)")
        void wildcardOriginWarns() {
            ApplicationProperties props = new ApplicationProperties();
            props.getSystem().setCorsAllowedOrigins(List.of("https://*.example.com"));

            CorsConfiguration cfg = cors(config(props).corsConfigurationSource());

            assertThat(cfg.getAllowedOriginPatterns()).contains("https://*.example.com");
        }
    }

    @Nested
    @DisplayName("saasSecurityFilterChain bean")
    class FilterChainBean {

        @Mock private JwtDecoder jwtDecoder;

        @Test
        @DisplayName("builds and returns the SecurityFilterChain from http.build()")
        @SuppressWarnings("unchecked")
        void buildsFilterChain() throws Exception {
            HttpSecurity http = mock(HttpSecurity.class, RETURNS_DEEP_STUBS);
            // http.build() returns DefaultSecurityFilterChain, so stub with that concrete type.
            org.springframework.security.web.DefaultSecurityFilterChain built =
                    mock(org.springframework.security.web.DefaultSecurityFilterChain.class);
            when(http.build()).thenReturn(built);

            // Device-credential filter is wired via an ObjectProvider; getIfAvailable() returns
            // null here, so the optional filter is simply not added (fine for a build-only check).
            org.springframework.beans.factory.ObjectProvider<
                            stirling.software.saas.accountlink.DeviceCredentialAuthenticationFilter>
                    deviceFilterProvider =
                            mock(org.springframework.beans.factory.ObjectProvider.class);

            SecurityFilterChain result =
                    config(new ApplicationProperties())
                            .saasSecurityFilterChain(http, jwtDecoder, deviceFilterProvider);

            assertThat(result).isSameAs(built);
        }
    }

    @Nested
    @DisplayName("toAuthentication anonymous role mapping (interplay with config fields)")
    class ToAuthenticationAnon {

        @Test
        @DisplayName("anonymous JWT maps to LIMITED_API_USER role")
        void anonymousMapsLimited() {
            Jwt jwt =
                    new Jwt(
                            "tok",
                            java.time.Instant.now(),
                            java.time.Instant.now().plusSeconds(60),
                            java.util.Map.of("alg", "HS256"),
                            java.util.Map.of(
                                    "sub",
                                    java.util.UUID.randomUUID().toString(),
                                    "is_anonymous",
                                    Boolean.TRUE));

            var auth = SupabaseSecurityConfig.toAuthentication(jwt);

            assertThat(auth.getAuthorities().stream().map(a -> a.getAuthority()).toList())
                    .contains("ROLE_LIMITED_API_USER");
        }
    }
}
