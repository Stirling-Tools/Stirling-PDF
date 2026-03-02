package stirling.software.proprietary.security.configuration;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.CorsConfigurer;
import org.springframework.security.config.annotation.web.configurers.CsrfConfigurer;
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer.FrameOptionsConfig;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.mapping.GrantedAuthoritiesMapper;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.saml2.provider.service.authentication.OpenSaml5AuthenticationProvider;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.web.authentication.OpenSaml5AuthenticationRequestResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.rememberme.PersistentTokenRepository;
import org.springframework.security.web.firewall.HttpFirewall;
import org.springframework.security.web.firewall.StrictHttpFirewall;
import org.springframework.security.web.savedrequest.NullRequestCache;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.AppConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.RequestUriUtils;
import stirling.software.proprietary.security.CustomAuthenticationFailureHandler;
import stirling.software.proprietary.security.CustomAuthenticationSuccessHandler;
import stirling.software.proprietary.security.CustomLogoutSuccessHandler;
import stirling.software.proprietary.security.JwtAuthenticationEntryPoint;
import stirling.software.proprietary.security.database.repository.JPATokenRepositoryImpl;
import stirling.software.proprietary.security.database.repository.PersistentLoginRepository;
import stirling.software.proprietary.security.filter.IPRateLimitingFilter;
import stirling.software.proprietary.security.filter.JwtAuthenticationFilter;
import stirling.software.proprietary.security.filter.UserAuthenticationFilter;
import stirling.software.proprietary.security.oauth2.CustomOAuth2AuthenticationFailureHandler;
import stirling.software.proprietary.security.oauth2.CustomOAuth2AuthenticationSuccessHandler;
import stirling.software.proprietary.security.oauth2.TauriAuthorizationRequestResolver;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticationFailureHandler;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticationSuccessHandler;
import stirling.software.proprietary.security.saml2.CustomSaml2ResponseAuthenticationConverter;
import stirling.software.proprietary.security.service.CustomOAuth2UserService;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;

@Slf4j
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@DependsOn("runningProOrHigher")
public class SecurityConfiguration {

    private final CustomUserDetailsService userDetailsService;
    private final UserService userService;
    private final boolean loginEnabledValue;
    private final boolean runningProOrHigher;

    private final ApplicationProperties applicationProperties;
    private final ApplicationProperties.Security securityProperties;
    private final AppConfig appConfig;
    private final UserAuthenticationFilter userAuthenticationFilter;
    private final JwtServiceInterface jwtService;
    private final JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint;
    private final LoginAttemptService loginAttemptService;
    private final SessionPersistentRegistry sessionRegistry;
    private final PersistentLoginRepository persistentLoginRepository;
    private final GrantedAuthoritiesMapper oAuth2userAuthoritiesMapper;
    private final RelyingPartyRegistrationRepository saml2RelyingPartyRegistrations;
    private final OpenSaml5AuthenticationRequestResolver saml2AuthenticationRequestResolver;
    private final stirling.software.proprietary.service.UserLicenseSettingsService
            licenseSettingsService;
    private final ClientRegistrationRepository clientRegistrationRepository;

    public SecurityConfiguration(
            PersistentLoginRepository persistentLoginRepository,
            CustomUserDetailsService userDetailsService,
            @Lazy UserService userService,
            @Qualifier("loginEnabled") boolean loginEnabledValue,
            @Qualifier("runningProOrHigher") boolean runningProOrHigher,
            AppConfig appConfig,
            ApplicationProperties applicationProperties,
            ApplicationProperties.Security securityProperties,
            UserAuthenticationFilter userAuthenticationFilter,
            JwtServiceInterface jwtService,
            JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint,
            LoginAttemptService loginAttemptService,
            SessionPersistentRegistry sessionRegistry,
            @Autowired(required = false) GrantedAuthoritiesMapper oAuth2userAuthoritiesMapper,
            @Autowired(required = false)
                    RelyingPartyRegistrationRepository saml2RelyingPartyRegistrations,
            @Autowired(required = false)
                    OpenSaml5AuthenticationRequestResolver saml2AuthenticationRequestResolver,
            @Autowired(required = false) ClientRegistrationRepository clientRegistrationRepository,
            stirling.software.proprietary.service.UserLicenseSettingsService
                    licenseSettingsService) {
        this.userDetailsService = userDetailsService;
        this.userService = userService;
        this.loginEnabledValue = loginEnabledValue;
        this.runningProOrHigher = runningProOrHigher;
        this.appConfig = appConfig;
        this.applicationProperties = applicationProperties;
        this.securityProperties = securityProperties;
        this.userAuthenticationFilter = userAuthenticationFilter;
        this.jwtService = jwtService;
        this.jwtAuthenticationEntryPoint = jwtAuthenticationEntryPoint;
        this.loginAttemptService = loginAttemptService;
        this.sessionRegistry = sessionRegistry;
        this.persistentLoginRepository = persistentLoginRepository;
        this.oAuth2userAuthoritiesMapper = oAuth2userAuthoritiesMapper;
        this.saml2RelyingPartyRegistrations = saml2RelyingPartyRegistrations;
        this.saml2AuthenticationRequestResolver = saml2AuthenticationRequestResolver;
        this.clientRegistrationRepository = clientRegistrationRepository;
        this.licenseSettingsService = licenseSettingsService;
    }

    @Bean
    public static PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Configures HttpFirewall to allow non-ASCII characters in header values.
     * This fixes issues with reverse proxies (like Authelia) that may set headers
     * with non-ASCII characters (e.g., "Remote-User: Dvořák").
     *
     * <p>By default, StrictHttpFirewall rejects header values containing non-ASCII characters.
     * This configuration allows valid UTF-8 encoded characters while maintaining security.
     *
     * @return Configured HttpFirewall that allows non-ASCII characters in headers
     */
    @Bean
    public HttpFirewall httpFirewall() {
        StrictHttpFirewall firewall = new StrictHttpFirewall();
        // Allow non-ASCII characters in header values
        // This is needed for reverse proxies that may set headers with non-ASCII usernames
        firewall.setAllowedHeaderValues(
                headerValue -> {
                    if (headerValue == null) {
                        return false;
                    }
                    // Allow all header values including non-ASCII characters
                    // The default StrictHttpFirewall rejects non-ASCII, but we need to allow
                    // them for headers like Remote-User that may contain international names
                    // This fixes issue #5377 where Remote-User header with non-ASCII
                    // characters (e.g., "Dvořák") was rejected with 400 Bad Request
                    try {
                        // Validate that the value is valid UTF-8
                        headerValue.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                        return true;
                    } catch (Exception e) {
                        // Reject invalid encoding
                        return false;
                    }
                });
        // Also allow non-ASCII in parameter values for consistency
        firewall.setAllowedParameterValues(
                parameterValue -> {
                    if (parameterValue == null) {
                        return false;
                    }
                    try {
                        // Validate UTF-8 encoding
                        parameterValue.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                        return true;
                    } catch (Exception e) {
                        return false;
                    }
                });
        return firewall;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        List<String> configuredOrigins = null;
        if (applicationProperties.getSystem() != null) {
            configuredOrigins = applicationProperties.getSystem().getCorsAllowedOrigins();
        }

        CorsConfiguration cfg = new CorsConfiguration();
        if (configuredOrigins != null && !configuredOrigins.isEmpty()) {
            cfg.setAllowedOriginPatterns(configuredOrigins);
            log.debug(
                    "CORS configured with allowed origin patterns from settings.yml: {}",
                    configuredOrigins);
        } else {
            // Default to allowing all origins when nothing is configured
            cfg.setAllowedOriginPatterns(List.of("*"));
            log.info(
                    "No CORS allowed origins configured in settings.yml"
                            + " (system.corsAllowedOrigins); allowing all origins.");
        }

        // Explicitly configure supported HTTP methods (include OPTIONS for preflight)
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));

        cfg.setAllowedHeaders(
                List.of(
                        "Authorization",
                        "Content-Type",
                        "X-Requested-With",
                        "Accept",
                        "Origin",
                        "X-API-KEY",
                        "X-CSRF-TOKEN",
                        "X-XSRF-TOKEN"));

        cfg.setExposedHeaders(
                List.of(
                        "WWW-Authenticate",
                        "X-Total-Count",
                        "X-Page-Number",
                        "X-Page-Size",
                        "Content-Disposition",
                        "Content-Type"));

        cfg.setAllowCredentials(true);
        cfg.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }

    @Bean
    @Order(1)
    public SecurityFilterChain samlFilterChain(
            HttpSecurity http,
            @Lazy IPRateLimitingFilter rateLimitingFilter,
            @Lazy JwtAuthenticationFilter jwtAuthenticationFilter)
            throws Exception {
        http.securityMatcher("/saml2/**", "/login/saml2/**");

        SessionCreationPolicy sessionPolicy =
                (securityProperties.isSaml2Active() && runningProOrHigher)
                        ? SessionCreationPolicy.IF_REQUIRED
                        : SessionCreationPolicy.STATELESS;

        return configureSecurity(http, rateLimitingFilter, jwtAuthenticationFilter, sessionPolicy);
    }

    @Bean
    @Order(2)
    public SecurityFilterChain filterChain(
            HttpSecurity http,
            @Lazy IPRateLimitingFilter rateLimitingFilter,
            @Lazy JwtAuthenticationFilter jwtAuthenticationFilter)
            throws Exception {
        SessionCreationPolicy sessionPolicy = SessionCreationPolicy.STATELESS;
        return configureSecurity(http, rateLimitingFilter, jwtAuthenticationFilter, sessionPolicy);
    }

    private SecurityFilterChain configureSecurity(
            HttpSecurity http,
            @Lazy IPRateLimitingFilter rateLimitingFilter,
            @Lazy JwtAuthenticationFilter jwtAuthenticationFilter,
            SessionCreationPolicy sessionPolicy)
            throws Exception {
        // Enable CORS only if we have configured origins
        CorsConfigurationSource corsSource = corsConfigurationSource();
        if (corsSource != null) {
            http.cors(cors -> cors.configurationSource(corsSource));
        } else {
            // Explicitly disable CORS when no origins are configured
            http.cors(CorsConfigurer::disable);
        }

        http.csrf(CsrfConfigurer::disable);

        // Configure X-Frame-Options based on settings.yml configuration
        // When login is disabled, automatically disable X-Frame-Options to allow embedding
        if (!loginEnabledValue) {
            http.headers(headers -> headers.frameOptions(FrameOptionsConfig::disable));
        } else {
            String xFrameOption = securityProperties.getXFrameOptions();
            if (xFrameOption != null) {
                http.headers(
                        headers -> {
                            if ("DISABLED".equalsIgnoreCase(xFrameOption)) {
                                headers.frameOptions(FrameOptionsConfig::disable);
                            } else if ("SAMEORIGIN".equalsIgnoreCase(xFrameOption)) {
                                headers.frameOptions(FrameOptionsConfig::sameOrigin);
                            } else {
                                // Default to DENY
                                headers.frameOptions(FrameOptionsConfig::deny);
                            }
                        });
            } else {
                // If not configured, use default DENY
                http.headers(headers -> headers.frameOptions(FrameOptionsConfig::deny));
            }
        }

        if (loginEnabledValue) {

            http.addFilterBefore(
                            userAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                    .addFilterBefore(rateLimitingFilter, UsernamePasswordAuthenticationFilter.class)
                    .addFilterBefore(jwtAuthenticationFilter, UserAuthenticationFilter.class);

            http.sessionManagement(
                    sessionManagement -> sessionManagement.sessionCreationPolicy(sessionPolicy));
            http.authenticationProvider(daoAuthenticationProvider());
            http.requestCache(requestCache -> requestCache.requestCache(new NullRequestCache()));

            // Configure exception handling for API endpoints
            http.exceptionHandling(
                    exceptions ->
                            exceptions.defaultAuthenticationEntryPointFor(
                                    jwtAuthenticationEntryPoint,
                                    request -> {
                                        String contextPath = request.getContextPath();
                                        String requestURI = request.getRequestURI();
                                        return requestURI.startsWith(contextPath + "/api/");
                                    }));

            http.logout(
                    logout ->
                            logout.logoutRequestMatcher(
                                            PathPatternRequestMatcher.withDefaults()
                                                    .matcher("/logout"))
                                    .logoutSuccessHandler(
                                            new CustomLogoutSuccessHandler(
                                                    securityProperties, appConfig, jwtService))
                                    .clearAuthentication(true)
                                    .invalidateHttpSession(true)
                                    .deleteCookies("JSESSIONID", "remember-me", "stirling_jwt"));
            http.rememberMe(
                    rememberMeConfigurer -> // Use the configurator directly
                    rememberMeConfigurer
                                    .tokenRepository(persistentTokenRepository())
                                    .tokenValiditySeconds( // 14 days
                                            14 * 24 * 60 * 60)
                                    .userDetailsService( // Your existing UserDetailsService
                                            userDetailsService)
                                    .useSecureCookie( // Enable secure cookie
                                            true)
                                    .rememberMeParameter( // Form parameter name
                                            "remember-me")
                                    .rememberMeCookieName( // Cookie name
                                            "remember-me")
                                    .alwaysRemember(false));
            http.authorizeHttpRequests(
                    authz ->
                            authz.requestMatchers(
                                            req -> {
                                                String uri = req.getRequestURI();
                                                String contextPath = req.getContextPath();
                                                // Check if it's a public auth endpoint or static
                                                // resource
                                                return RequestUriUtils.isStaticResource(
                                                                contextPath, uri)
                                                        || RequestUriUtils.isPublicAuthEndpoint(
                                                                uri, contextPath);
                                            })
                                    .permitAll()
                                    .anyRequest()
                                    .authenticated());
            // Handle User/Password Logins
            if (securityProperties.isUserPass()) {
                // v2: Authentication is handled via API (/api/v1/auth/login), not form login
                // We configure form login to handle Spring Security redirects,
                // but use /perform_login as the processing URL so /login remains a React route
                http.formLogin(
                        formLogin ->
                                formLogin
                                        .loginPage("/login") // Redirect here when unauthenticated
                                        .loginProcessingUrl(
                                                "/perform_login") // Process form posts here (not
                                        // /login)
                                        .successHandler(
                                                new CustomAuthenticationSuccessHandler(
                                                        loginAttemptService,
                                                        userService,
                                                        jwtService))
                                        .failureHandler(
                                                new CustomAuthenticationFailureHandler(
                                                        loginAttemptService, userService))
                                        .permitAll());
            }
            // Handle OAUTH2 Logins
            if (securityProperties.isOauth2Active()) {
                http.oauth2Login(
                        oauth2 -> {
                            oauth2.loginPage("/login")
                                    .authorizationEndpoint(
                                            authorizationEndpoint -> {
                                                if (clientRegistrationRepository != null) {
                                                    authorizationEndpoint
                                                            .authorizationRequestResolver(
                                                                    new TauriAuthorizationRequestResolver(
                                                                            clientRegistrationRepository));
                                                }
                                            })
                                    .successHandler(
                                            new CustomOAuth2AuthenticationSuccessHandler(
                                                    loginAttemptService,
                                                    securityProperties.getOauth2(),
                                                    userService,
                                                    jwtService,
                                                    licenseSettingsService,
                                                    applicationProperties))
                                    .failureHandler(new CustomOAuth2AuthenticationFailureHandler())
                                    // Add existing Authorities from the database
                                    .userInfoEndpoint(
                                            userInfoEndpoint ->
                                                    userInfoEndpoint
                                                            .oidcUserService(
                                                                    new CustomOAuth2UserService(
                                                                            securityProperties
                                                                                    .getOauth2(),
                                                                            userService,
                                                                            loginAttemptService))
                                                            .userAuthoritiesMapper(
                                                                    oAuth2userAuthoritiesMapper))
                                    .permitAll();
                        });
            }
            // Handle SAML
            if (securityProperties.isSaml2Active() && runningProOrHigher) {
                OpenSaml5AuthenticationProvider authenticationProvider =
                        new OpenSaml5AuthenticationProvider();
                authenticationProvider.setResponseAuthenticationConverter(
                        new CustomSaml2ResponseAuthenticationConverter(userService));
                http.authenticationProvider(authenticationProvider)
                        .saml2Login(
                                saml2 -> {
                                    try {
                                        saml2.loginPage("/login")
                                                .relyingPartyRegistrationRepository(
                                                        saml2RelyingPartyRegistrations)
                                                .authenticationManager(
                                                        new ProviderManager(authenticationProvider))
                                                .successHandler(
                                                        new CustomSaml2AuthenticationSuccessHandler(
                                                                loginAttemptService,
                                                                securityProperties.getSaml2(),
                                                                userService,
                                                                jwtService,
                                                                licenseSettingsService,
                                                                applicationProperties))
                                                .failureHandler(
                                                        new CustomSaml2AuthenticationFailureHandler())
                                                .authenticationRequestResolver(
                                                        saml2AuthenticationRequestResolver);
                                    } catch (Exception e) {
                                        log.error("Error configuring SAML 2 login", e);
                                        throw new RuntimeException(e);
                                    }
                                })
                        .saml2Metadata(metadata -> {});
            }
        } else {
            log.debug("Login is not enabled.");
            http.authorizeHttpRequests(authz -> authz.anyRequest().permitAll());
        }
        return http.build();
    }

    public DaoAuthenticationProvider daoAuthenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    @Bean
    public IPRateLimitingFilter rateLimitingFilter() {
        // Example limit TODO add config level
        int maxRequestsPerIp = 1000000;
        return new IPRateLimitingFilter(maxRequestsPerIp, maxRequestsPerIp);
    }

    @Bean
    public PersistentTokenRepository persistentTokenRepository() {
        return new JPATokenRepositoryImpl(persistentLoginRepository);
    }

    @Bean
    public JwtAuthenticationFilter jwtAuthenticationFilter() {
        return new JwtAuthenticationFilter(
                jwtService,
                userService,
                userDetailsService,
                jwtAuthenticationEntryPoint,
                securityProperties);
    }
}
