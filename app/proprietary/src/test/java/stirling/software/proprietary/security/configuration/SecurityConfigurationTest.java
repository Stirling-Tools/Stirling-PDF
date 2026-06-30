package stirling.software.proprietary.security.configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.DefaultSecurityFilterChain;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.firewall.HttpFirewall;
import org.springframework.security.web.firewall.StrictHttpFirewall;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import stirling.software.common.configuration.AppConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.JwtAuthenticationEntryPoint;
import stirling.software.proprietary.security.database.repository.PersistentLoginRepository;
import stirling.software.proprietary.security.filter.IPRateLimitingFilter;
import stirling.software.proprietary.security.filter.JwtAuthenticationFilter;
import stirling.software.proprietary.security.filter.UserAuthenticationFilter;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;
import stirling.software.proprietary.service.AiUserDataService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

/**
 * Unit tests for {@link SecurityConfiguration}'s standalone {@code @Bean} factory methods and the
 * login-disabled filter-chain path. All collaborators are mocked; {@link HttpSecurity} uses deep
 * stubs and {@code http.build()} is stubbed to a concrete {@link DefaultSecurityFilterChain}.
 */
@DisplayName("SecurityConfiguration")
class SecurityConfigurationTest {

    private CustomUserDetailsService userDetailsService;
    private UserService userService;
    private AppConfig appConfig;
    private UserAuthenticationFilter userAuthenticationFilter;
    private JwtServiceInterface jwtService;
    private JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint;
    private LoginAttemptService loginAttemptService;
    private SessionPersistentRegistry sessionRegistry;
    private PersistentLoginRepository persistentLoginRepository;
    private UserLicenseSettingsService licenseSettingsService;
    private AiUserDataService aiUserDataService;
    private PasswordEncoder passwordEncoder;

    private ApplicationProperties applicationProperties;
    private ApplicationProperties.Security securityProperties;

    private SecurityConfiguration newConfig(boolean loginEnabled) {
        return new SecurityConfiguration(
                persistentLoginRepository,
                userDetailsService,
                userService,
                loginEnabled,
                true,
                appConfig,
                applicationProperties,
                securityProperties,
                userAuthenticationFilter,
                jwtService,
                jwtAuthenticationEntryPoint,
                loginAttemptService,
                sessionRegistry,
                null,
                null,
                null,
                null,
                licenseSettingsService,
                passwordEncoder,
                aiUserDataService);
    }

    @BeforeEach
    void setUp() {
        userDetailsService = mock(CustomUserDetailsService.class);
        userService = mock(UserService.class);
        appConfig = mock(AppConfig.class);
        userAuthenticationFilter = mock(UserAuthenticationFilter.class);
        jwtService = mock(JwtServiceInterface.class);
        jwtAuthenticationEntryPoint = mock(JwtAuthenticationEntryPoint.class);
        loginAttemptService = mock(LoginAttemptService.class);
        sessionRegistry = mock(SessionPersistentRegistry.class);
        persistentLoginRepository = mock(PersistentLoginRepository.class);
        licenseSettingsService = mock(UserLicenseSettingsService.class);
        aiUserDataService = mock(AiUserDataService.class);
        passwordEncoder = mock(PasswordEncoder.class);
        applicationProperties = new ApplicationProperties();
        securityProperties = new ApplicationProperties.Security();
    }

    @Nested
    @DisplayName("standalone beans")
    class StandaloneBeans {

        @Test
        @DisplayName("httpFirewall allows non-ASCII header values but rejects control chars")
        void httpFirewall() {
            HttpFirewall firewall = newConfig(true).httpFirewall();
            assertThat(firewall).isInstanceOf(StrictHttpFirewall.class);
        }

        @Test
        @DisplayName("corsConfigurationSource defaults to wildcard when nothing configured")
        void corsDefaultsToWildcard() {
            CorsConfigurationSource source = newConfig(true).corsConfigurationSource();
            assertThat(source).isInstanceOf(UrlBasedCorsConfigurationSource.class);

            CorsConfiguration cfg = configFor(source);
            assertThat(cfg.getAllowedOriginPatterns()).containsExactly("*");
            assertThat(cfg.getAllowCredentials()).isTrue();
            assertThat(cfg.getAllowedMethods()).contains("OPTIONS");
        }

        @Test
        @DisplayName("corsConfigurationSource uses configured origin patterns when present")
        void corsUsesConfiguredOrigins() {
            applicationProperties
                    .getSystem()
                    .setCorsAllowedOrigins(List.of("https://app.example.com"));

            CorsConfiguration cfg = configFor(newConfig(true).corsConfigurationSource());
            assertThat(cfg.getAllowedOriginPatterns()).containsExactly("https://app.example.com");
        }

        @Test
        @DisplayName("daoAuthenticationProvider is built with the configured password encoder")
        void daoAuthenticationProvider() {
            DaoAuthenticationProvider provider = newConfig(true).daoAuthenticationProvider();
            assertThat(provider).isNotNull();
        }

        @Test
        @DisplayName("rateLimitingFilter is created")
        void rateLimitingFilter() {
            IPRateLimitingFilter filter = newConfig(true).rateLimitingFilter();
            assertThat(filter).isNotNull();
        }

        @Test
        @DisplayName("persistentTokenRepository is created")
        void persistentTokenRepository() {
            assertThat(newConfig(true).persistentTokenRepository()).isNotNull();
        }

        @Test
        @DisplayName("jwtAuthenticationFilter is created")
        void jwtAuthenticationFilter() {
            JwtAuthenticationFilter filter = newConfig(true).jwtAuthenticationFilter();
            assertThat(filter).isNotNull();
        }

        private CorsConfiguration configFor(CorsConfigurationSource source) {
            return ((UrlBasedCorsConfigurationSource) source).getCorsConfigurations().get("/**");
        }
    }

    @Nested
    @DisplayName("filter chain (login disabled)")
    class LoginDisabledChain {

        @Test
        @DisplayName("builds a permit-all chain when login is disabled")
        void buildsPermitAllChain() throws Exception {
            HttpSecurity http = mock(HttpSecurity.class, RETURNS_DEEP_STUBS);
            // http.build() returns DefaultSecurityFilterChain, so stub with that concrete type.
            DefaultSecurityFilterChain built = mock(DefaultSecurityFilterChain.class);
            when(http.build()).thenReturn(built);

            IPRateLimitingFilter rateLimitingFilter = mock(IPRateLimitingFilter.class);
            JwtAuthenticationFilter jwtFilter = mock(JwtAuthenticationFilter.class);

            SecurityFilterChain chain =
                    newConfig(false).filterChain(http, rateLimitingFilter, jwtFilter);

            assertThat(chain).isSameAs(built);
        }
    }
}
