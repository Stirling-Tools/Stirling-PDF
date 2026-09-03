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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
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

    @Mock
    private stirling.software.proprietary.security.service.ApiKeyAuthenticationService
            apiKeyAuthenticationService;

    private SupabaseSecurityConfig config(ApplicationProperties props) {
        return config(props, new MockEnvironment());
    }

    /** Loopback CORS origins are only added outside production, so the environment decides. */
    private SupabaseSecurityConfig config(ApplicationProperties props, Environment environment) {
        return new SupabaseSecurityConfig(
                userService,
                teamService,
                supabaseUserService,
                saasTeamService,
                props,
                apiKeyAuthenticationService,
                environment);
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
        @DisplayName("production does not allow loopback on arbitrary ports")
        void productionHasNoLoopbackWildcard() {
            CorsConfiguration cfg =
                    cors(config(new ApplicationProperties()).corsConfigurationSource());

            assertThat(cfg.getAllowedOriginPatterns())
                    .doesNotContain("http://localhost:[*]", "http://127.0.0.1:[*]");
        }

        @Test
        @DisplayName("non-production allows loopback on any port so dev servers can move")
        void devAllowsAnyLoopbackPort() {
            // Several dev servers run side by side and their ports change; pinning a list turns
            // every new local environment into an opaque CORS failure.
            MockEnvironment dev = new MockEnvironment();
            dev.setActiveProfiles("saas", "dev");

            CorsConfiguration cfg =
                    cors(config(new ApplicationProperties(), dev).corsConfigurationSource());

            assertThat(cfg.getAllowedOriginPatterns())
                    .contains("http://localhost:[*]", "http://127.0.0.1:[*]")
                    // Still credentialed, which is the reason the pattern form matters.
                    .contains("https://stirling.com");
            assertThat(cfg.getAllowCredentials()).isTrue();
        }

        @Test
        @DisplayName("an operator origin list is respected verbatim even in dev")
        void operatorOverrideSuppressesLoopbackWildcard() {
            ApplicationProperties props = new ApplicationProperties();
            props.getSystem().setCorsAllowedOrigins(List.of("https://custom.example.com"));
            MockEnvironment dev = new MockEnvironment();
            dev.setActiveProfiles("saas", "dev");

            CorsConfiguration cfg = cors(config(props, dev).corsConfigurationSource());

            // An operator who set the list meant it; we do not widen it behind their back.
            assertThat(cfg.getAllowedOriginPatterns())
                    .contains("https://custom.example.com")
                    .doesNotContain("http://localhost:[*]");
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

    @Nested
    @DisplayName("linked-instance CORS")
    class LinkedInstanceCors {

        /** An origin no allow-list could ever contain: a customer's own deployment. */
        private static final String SELF_HOSTED = "http://54.175.155.236:7779";

        private CorsConfigurationSource source(boolean accountLinkEnabled) {
            SupabaseSecurityConfig cfg = config(new ApplicationProperties());
            ReflectionTestUtils.setField(cfg, "accountLinkEnabled", accountLinkEnabled);
            return cfg.corsConfigurationSource();
        }

        private CorsConfiguration resolve(CorsConfigurationSource source, String path) {
            return source.getCorsConfiguration(new MockHttpServletRequest("GET", path));
        }

        @ParameterizedTest
        @ValueSource(
                strings = {
                    "/api/v1/payg/wallet",
                    "/api/v1/payg/wallet/refresh",
                    "/api/v1/payg/invoices",
                    "/api/v1/payg/cap",
                    "/api/v1/procurement/quote",
                    "/api/v1/legal/consent",
                    "/api/v1/proprietary/ui-data/documents",
                    "/api/v1/proprietary/ui-data/audit-export",
                    "/api/v1/proprietary/ui-data/infrastructure/audit-log"
                })
        @DisplayName("every apiClient.saas path is readable from any origin")
        void portalReadsAllowAnyOrigin(String path) {
            CorsConfiguration cfg = resolve(source(true), path);

            assertThat(cfg.checkOrigin(SELF_HOSTED)).isEqualTo("*");
            // The wildcard is only defensible without credentials. These must never both be set:
            // the browser rejects the pair outright, and it would be an open credentialed API.
            assertThat(cfg.getAllowCredentials()).isNotEqualTo(Boolean.TRUE);
        }

        @Test
        @DisplayName("PATCH is allowed; the cap endpoint needs it")
        void patchAllowed() {
            CorsConfiguration cfg = resolve(source(true), "/api/v1/payg/cap");

            assertThat(cfg.checkHttpMethod(HttpMethod.PATCH)).isNotNull();
        }

        @ParameterizedTest
        @ValueSource(
                strings = {
                    "/api/v1/instance/sync",
                    // Same prefix as the portal reads above, but not portal surface. Widening
                    // ui-data to "/**" would hand these to any origin too.
                    "/api/v1/proprietary/ui-data/admin-settings",
                    "/api/v1/proprietary/ui-data/database",
                    "/api/v1/proprietary/ui-data/teams"
                })
        @DisplayName("every other path keeps the credentialed allow-list")
        void otherPathsUnchanged(String path) {
            CorsConfiguration cfg = resolve(source(true), path);

            assertThat(cfg.getAllowCredentials()).isTrue();
            assertThat(cfg.checkOrigin(SELF_HOSTED)).isNull();
        }

        @Test
        @DisplayName("no wildcard at all when account linking is off")
        void flagOffKeepsAllowList() {
            CorsConfiguration cfg = resolve(source(false), "/api/v1/payg/wallet");

            assertThat(cfg.getAllowCredentials()).isTrue();
            assertThat(cfg.checkOrigin(SELF_HOSTED)).isNull();
        }
    }
}
