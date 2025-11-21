package stirling.software.proprietary.security.configuration;

import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.CsrfConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.mapping.GrantedAuthoritiesMapper;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.saml2.provider.service.authentication.OpenSaml4AuthenticationProvider;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.web.authentication.OpenSaml4AuthenticationRequestResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.rememberme.PersistentTokenRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
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
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.oauth2.CustomOAuth2AuthenticationFailureHandler;
import stirling.software.proprietary.security.oauth2.CustomOAuth2AuthenticationSuccessHandler;
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
    private final OpenSaml4AuthenticationRequestResolver saml2AuthenticationRequestResolver;

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
                    OpenSaml4AuthenticationRequestResolver saml2AuthenticationRequestResolver) {
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
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
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
                    "No CORS allowed origins configured in settings.yml (system.corsAllowedOrigins); allowing all origins.");
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
    public SecurityFilterChain filterChain(
            HttpSecurity http,
            @Lazy IPRateLimitingFilter rateLimitingFilter,
            @Lazy JwtAuthenticationFilter jwtAuthenticationFilter)
            throws Exception {
        // Enable CORS only if we have configured origins
        CorsConfigurationSource corsSource = corsConfigurationSource();
        if (corsSource != null) {
            http.cors(cors -> cors.configurationSource(corsSource));
        } else {
            // Explicitly disable CORS when no origins are configured
            http.cors(cors -> cors.disable());
        }

        if (securityProperties.getCsrfDisabled() || !loginEnabledValue) {
            http.csrf(CsrfConfigurer::disable);
        }

        if (loginEnabledValue) {
            boolean v2Enabled = appConfig.v2Enabled();

            http.addFilterBefore(
                            userAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                    .addFilterBefore(rateLimitingFilter, UsernamePasswordAuthenticationFilter.class)
                    .addFilterBefore(jwtAuthenticationFilter, UserAuthenticationFilter.class);

            if (!securityProperties.getCsrfDisabled()) {
                CookieCsrfTokenRepository cookieRepo =
                        CookieCsrfTokenRepository.withHttpOnlyFalse();
                CsrfTokenRequestAttributeHandler requestHandler =
                        new CsrfTokenRequestAttributeHandler();
                requestHandler.setCsrfRequestAttributeName(null);
                http.csrf(
                        csrf ->
                                csrf.ignoringRequestMatchers(
                                                request -> {
                                                    String uri = request.getRequestURI();

                                                    // Ignore CSRF for auth endpoints
                                                    if (uri.startsWith("/api/v1/auth/")) {
                                                        return true;
                                                    }

                                                    String apiKey = request.getHeader("X-API-KEY");
                                                    // If there's no API key, don't ignore CSRF
                                                    // (return false)
                                                    if (apiKey == null || apiKey.trim().isEmpty()) {
                                                        return false;
                                                    }
                                                    // Validate API key using existing UserService
                                                    try {
                                                        Optional<User> user =
                                                                userService.getUserByApiKey(apiKey);
                                                        // If API key is valid, ignore CSRF (return
                                                        // true)
                                                        // If API key is invalid, don't ignore CSRF
                                                        // (return false)
                                                        return user.isPresent();
                                                    } catch (Exception e) {
                                                        // If there's any error validating the API
                                                        // key, don't ignore CSRF
                                                        return false;
                                                    }
                                                })
                                        .csrfTokenRepository(cookieRepo)
                                        .csrfTokenRequestHandler(requestHandler));
            }

            http.sessionManagement(
                    sessionManagement -> {
                        if (v2Enabled) {
                            sessionManagement.sessionCreationPolicy(
                                    SessionCreationPolicy.STATELESS);
                        } else {
                            sessionManagement
                                    .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                                    .maximumSessions(10)
                                    .maxSessionsPreventsLogin(false)
                                    .sessionRegistry(sessionRegistry)
                                    .expiredUrl("/login?logout=true");
                        }
                    });
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
                http.formLogin(
                        formLogin ->
                                formLogin
                                        .loginPage("/login")
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
                            // v1: Use /oauth2 as login page for Thymeleaf templates
                            if (!v2Enabled) {
                                oauth2.loginPage("/oauth2");
                            }

                            // v2: Don't set loginPage, let default OAuth2 flow handle it
                            oauth2
                                    /*
                                       This Custom handler is used to check if the OAUTH2 user trying to log in, already exists in the database.
                                       If user exists, login proceeds as usual. If user does not exist, then it is auto-created but only if 'OAUTH2AutoCreateUser'
                                       is set as true, else login fails with an error message advising the same.
                                    */
                                    .successHandler(
                                            new CustomOAuth2AuthenticationSuccessHandler(
                                                    loginAttemptService,
                                                    securityProperties,
                                                    userService,
                                                    jwtService))
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
                OpenSaml4AuthenticationProvider authenticationProvider =
                        new OpenSaml4AuthenticationProvider();
                authenticationProvider.setResponseAuthenticationConverter(
                        new CustomSaml2ResponseAuthenticationConverter(userService));
                http.authenticationProvider(authenticationProvider)
                        .saml2Login(
                                saml2 -> {
                                    try {
                                        // Only set login page for v1/Thymeleaf mode
                                        if (!v2Enabled) {
                                            saml2.loginPage("/saml2");
                                        }

                                        saml2.relyingPartyRegistrationRepository(
                                                        saml2RelyingPartyRegistrations)
                                                .authenticationManager(
                                                        new ProviderManager(authenticationProvider))
                                                .successHandler(
                                                        new CustomSaml2AuthenticationSuccessHandler(
                                                                loginAttemptService,
                                                                securityProperties,
                                                                userService,
                                                                jwtService))
                                                .failureHandler(
                                                        new CustomSaml2AuthenticationFailureHandler())
                                                .authenticationRequestResolver(
                                                        saml2AuthenticationRequestResolver);
                                    } catch (Exception e) {
                                        log.error("Error configuring SAML 2 login", e);
                                        throw new RuntimeException(e);
                                    }
                                });
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
