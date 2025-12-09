package stirling.software.proprietary.security.configuration;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.CsrfConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.mapping.GrantedAuthoritiesMapper;
import org.springframework.security.saml2.provider.service.authentication.OpenSaml4AuthenticationProvider;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.web.authentication.OpenSaml4AuthenticationRequestResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.rememberme.PersistentTokenRepository;
import org.springframework.security.web.savedrequest.NullRequestCache;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.stereotype.Component;
import org.springframework.web.cors.CorsConfigurationSource;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.AppConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.RequestUriUtils;
import stirling.software.proprietary.security.CustomAuthenticationFailureHandler;
import stirling.software.proprietary.security.CustomAuthenticationSuccessHandler;
import stirling.software.proprietary.security.CustomLogoutSuccessHandler;
import stirling.software.proprietary.security.JwtAuthenticationEntryPoint;
import stirling.software.proprietary.security.filter.IPRateLimitingFilter;
import stirling.software.proprietary.security.filter.JwtAuthenticationFilter;
import stirling.software.proprietary.security.filter.UserAuthenticationFilter;
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
import stirling.software.proprietary.service.UserLicenseSettingsService;

@Slf4j
@Component
@ConditionalOnMissingBean(SecurityChainConfigurer.class)
public class DefaultSecurityChainConfigurer implements SecurityChainConfigurer {

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
    private final CorsConfigurationSource corsConfigurationSource;
    private final IPRateLimitingFilter rateLimitingFilter;
    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final GrantedAuthoritiesMapper oAuth2userAuthoritiesMapper;
    private final RelyingPartyRegistrationRepository saml2RelyingPartyRegistrations;
    private final OpenSaml4AuthenticationRequestResolver saml2AuthenticationRequestResolver;
    private final UserLicenseSettingsService licenseSettingsService;
    private final PersistentTokenRepository persistentTokenRepository;
    private final DaoAuthenticationProvider daoAuthenticationProvider;

    @Autowired
    public DefaultSecurityChainConfigurer(
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
            CorsConfigurationSource corsConfigurationSource,
            @Lazy IPRateLimitingFilter rateLimitingFilter,
            @Lazy JwtAuthenticationFilter jwtAuthenticationFilter,
            @Autowired(required = false) GrantedAuthoritiesMapper oAuth2userAuthoritiesMapper,
            @Autowired(required = false)
                    RelyingPartyRegistrationRepository saml2RelyingPartyRegistrations,
            @Autowired(required = false)
                    OpenSaml4AuthenticationRequestResolver saml2AuthenticationRequestResolver,
            UserLicenseSettingsService licenseSettingsService,
            PersistentTokenRepository persistentTokenRepository,
            DaoAuthenticationProvider daoAuthenticationProvider) {
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
        this.corsConfigurationSource = corsConfigurationSource;
        this.rateLimitingFilter = rateLimitingFilter;
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.oAuth2userAuthoritiesMapper = oAuth2userAuthoritiesMapper;
        this.saml2RelyingPartyRegistrations = saml2RelyingPartyRegistrations;
        this.saml2AuthenticationRequestResolver = saml2AuthenticationRequestResolver;
        this.licenseSettingsService = licenseSettingsService;
        this.persistentTokenRepository = persistentTokenRepository;
        this.daoAuthenticationProvider = daoAuthenticationProvider;
    }

    @Override
    public SecurityFilterChain configure(HttpSecurity http) throws Exception {
        if (corsConfigurationSource != null) {
            http.cors(cors -> cors.configurationSource(corsConfigurationSource));
        } else {
            http.cors(cors -> cors.disable());
        }

        http.csrf(CsrfConfigurer::disable);

        if (loginEnabledValue) {
            boolean v2Enabled = appConfig.v2Enabled();

            http.addFilterBefore(
                            userAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                    .addFilterBefore(rateLimitingFilter, UsernamePasswordAuthenticationFilter.class)
                    .addFilterBefore(jwtAuthenticationFilter, UserAuthenticationFilter.class);

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
            http.authenticationProvider(daoAuthenticationProvider);
            http.requestCache(requestCache -> requestCache.requestCache(new NullRequestCache()));

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
                    rememberMeConfigurer ->
                            rememberMeConfigurer
                                    .tokenRepository(persistentTokenRepository)
                                    .tokenValiditySeconds(14 * 24 * 60 * 60)
                                    .userDetailsService(userDetailsService)
                                    .useSecureCookie(true)
                                    .rememberMeParameter("remember-me")
                                    .rememberMeCookieName("remember-me")
                                    .alwaysRemember(false));
            http.authorizeHttpRequests(
                    authz ->
                            authz.requestMatchers(
                                            req -> {
                                                String uri = req.getRequestURI();
                                                String contextPath = req.getContextPath();
                                                return RequestUriUtils.isStaticResource(
                                                                contextPath, uri)
                                                        || RequestUriUtils.isPublicAuthEndpoint(
                                                                uri, contextPath);
                                            })
                                    .permitAll()
                                    .anyRequest()
                                    .authenticated());

            if (securityProperties.isUserPass()) {
                http.formLogin(
                        formLogin ->
                                formLogin
                                        .loginPage("/login")
                                        .loginProcessingUrl("/perform_login")
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

            if (securityProperties.isOauth2Active()) {
                http.oauth2Login(
                        oauth2 -> {
                            if (!v2Enabled) {
                                oauth2.loginPage("/oauth2");
                            }
                            oauth2.successHandler(
                                            new CustomOAuth2AuthenticationSuccessHandler(
                                                    loginAttemptService,
                                                    securityProperties.getOauth2(),
                                                    userService,
                                                    jwtService,
                                                    licenseSettingsService))
                                    .failureHandler(new CustomOAuth2AuthenticationFailureHandler())
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

            if (securityProperties.isSaml2Active() && runningProOrHigher) {
                OpenSaml4AuthenticationProvider authenticationProvider =
                        new OpenSaml4AuthenticationProvider();
                authenticationProvider.setResponseAuthenticationConverter(
                        new CustomSaml2ResponseAuthenticationConverter(userService));
                http.authenticationProvider(authenticationProvider)
                        .saml2Login(
                                saml2 -> {
                                    try {
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
                                                                securityProperties.getSaml2(),
                                                                userService,
                                                                jwtService,
                                                                licenseSettingsService))
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
}
