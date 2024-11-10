package stirling.software.SPDF.config.security;

import java.security.cert.X509Certificate;
import java.util.*;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.io.Resource;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.authority.mapping.GrantedAuthoritiesMapper;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.ClientRegistrations;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.user.OAuth2UserAuthority;
import org.springframework.security.saml2.core.Saml2X509Credential;
import org.springframework.security.saml2.core.Saml2X509Credential.Saml2X509CredentialType;
import org.springframework.security.saml2.provider.service.authentication.OpenSaml4AuthenticationProvider;
import org.springframework.security.saml2.provider.service.registration.InMemoryRelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistration;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.web.authentication.Saml2WebSsoAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.rememberme.PersistentTokenRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.savedrequest.NullRequestCache;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;

import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.config.security.oauth2.CustomOAuth2AuthenticationFailureHandler;
import stirling.software.SPDF.config.security.oauth2.CustomOAuth2AuthenticationSuccessHandler;
import stirling.software.SPDF.config.security.oauth2.CustomOAuth2UserService;
import stirling.software.SPDF.config.security.saml2.CertificateUtils;
import stirling.software.SPDF.config.security.saml2.CustomSaml2AuthenticationFailureHandler;
import stirling.software.SPDF.config.security.saml2.CustomSaml2AuthenticationSuccessHandler;
import stirling.software.SPDF.config.security.saml2.CustomSaml2ResponseAuthenticationConverter;
import stirling.software.SPDF.config.security.session.SessionPersistentRegistry;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2.Client;
import stirling.software.SPDF.model.ApplicationProperties.Security.SAML2;
import stirling.software.SPDF.model.User;
import stirling.software.SPDF.model.provider.GithubProvider;
import stirling.software.SPDF.model.provider.GoogleProvider;
import stirling.software.SPDF.model.provider.KeycloakProvider;
import stirling.software.SPDF.repository.JPATokenRepositoryImpl;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@Slf4j
public class SecurityConfiguration {

    @Autowired private CustomUserDetailsService userDetailsService;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Autowired @Lazy private UserService userService;

    @Autowired
    @Qualifier("loginEnabled")
    public boolean loginEnabledValue;

    @Autowired ApplicationProperties applicationProperties;

    @Autowired private UserAuthenticationFilter userAuthenticationFilter;

    @Autowired private LoginAttemptService loginAttemptService;

    @Autowired private FirstLoginFilter firstLoginFilter;
    @Autowired private SessionPersistentRegistry sessionRegistry;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {

        if (loginEnabledValue) {
            http.addFilterBefore(
                    userAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
            if (applicationProperties.getSecurity().getCsrfDisabled()) {
                http.csrf(csrf -> csrf.disable());
            } else {
                CookieCsrfTokenRepository cookieRepo =
                        CookieCsrfTokenRepository.withHttpOnlyFalse();
                CsrfTokenRequestAttributeHandler requestHandler =
                        new CsrfTokenRequestAttributeHandler();
                requestHandler.setCsrfRequestAttributeName(null);
                http.csrf(
                        csrf ->
                                csrf.ignoringRequestMatchers(
                                                request -> {
                                                    String apiKey = request.getHeader("X-API-Key");

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
            http.addFilterBefore(rateLimitingFilter(), UsernamePasswordAuthenticationFilter.class);
            http.addFilterAfter(firstLoginFilter, UsernamePasswordAuthenticationFilter.class);
            http.sessionManagement(
                    sessionManagement ->
                            sessionManagement
                                    .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                                    .maximumSessions(10)
                                    .maxSessionsPreventsLogin(false)
                                    .sessionRegistry(sessionRegistry)
                                    .expiredUrl("/login?logout=true"));

            http.authenticationProvider(daoAuthenticationProvider());
            http.requestCache(requestCache -> requestCache.requestCache(new NullRequestCache()));
            http.logout(
                    logout ->
                            logout.logoutRequestMatcher(new AntPathRequestMatcher("/logout"))
                                    .logoutSuccessHandler(
                                            new CustomLogoutSuccessHandler(applicationProperties))
                                    .clearAuthentication(true)
                                    .invalidateHttpSession(true) // Invalidate session
                                    .deleteCookies("JSESSIONID", "remember-me"));
            http.rememberMe(
                    rememberMeConfigurer ->
                            rememberMeConfigurer // Use the configurator directly
                                    .tokenRepository(persistentTokenRepository())
                                    .tokenValiditySeconds(14 * 24 * 60 * 60) // 14 days
                                    .userDetailsService(
                                            userDetailsService) // Your existing UserDetailsService
                                    .useSecureCookie(true) // Enable secure cookie
                                    .rememberMeParameter("remember-me") // Form parameter name
                                    .rememberMeCookieName("remember-me") // Cookie name
                                    .alwaysRemember(false));
            http.authorizeHttpRequests(
                    authz ->
                            authz.requestMatchers(
                                            req -> {
                                                String uri = req.getRequestURI();
                                                String contextPath = req.getContextPath();

                                                // Remove the context path from the URI
                                                String trimmedUri =
                                                        uri.startsWith(contextPath)
                                                                ? uri.substring(
                                                                        contextPath.length())
                                                                : uri;

                                                return trimmedUri.startsWith("/login")
                                                        || trimmedUri.startsWith("/oauth")
                                                        || trimmedUri.startsWith("/saml2")
                                                        || trimmedUri.endsWith(".svg")
                                                        || trimmedUri.startsWith("/register")
                                                        || trimmedUri.startsWith("/error")
                                                        || trimmedUri.startsWith("/images/")
                                                        || trimmedUri.startsWith("/public/")
                                                        || trimmedUri.startsWith("/css/")
                                                        || trimmedUri.startsWith("/fonts/")
                                                        || trimmedUri.startsWith("/js/")
                                                        || trimmedUri.startsWith(
                                                                "/api/v1/info/status");
                                            })
                                    .permitAll()
                                    .anyRequest()
                                    .authenticated());

            // Handle User/Password Logins
            if (applicationProperties.getSecurity().isUserPass()) {
                http.formLogin(
                        formLogin ->
                                formLogin
                                        .loginPage("/login")
                                        .successHandler(
                                                new CustomAuthenticationSuccessHandler(
                                                        loginAttemptService, userService))
                                        .failureHandler(
                                                new CustomAuthenticationFailureHandler(
                                                        loginAttemptService, userService))
                                        .defaultSuccessUrl("/")
                                        .permitAll());
            }

            // Handle OAUTH2 Logins
            if (applicationProperties.getSecurity().isOauth2Activ()) {

                http.oauth2Login(
                        oauth2 ->
                                oauth2.loginPage("/oauth2")
                                        /*
                                        This Custom handler is used to check if the OAUTH2 user trying to log in, already exists in the database.
                                        If user exists, login proceeds as usual. If user does not exist, then it is autocreated but only if 'OAUTH2AutoCreateUser'
                                        is set as true, else login fails with an error message advising the same.
                                         */
                                        .successHandler(
                                                new CustomOAuth2AuthenticationSuccessHandler(
                                                        loginAttemptService,
                                                        applicationProperties,
                                                        userService))
                                        .failureHandler(
                                                new CustomOAuth2AuthenticationFailureHandler())
                                        // Add existing Authorities from the database
                                        .userInfoEndpoint(
                                                userInfoEndpoint ->
                                                        userInfoEndpoint
                                                                .oidcUserService(
                                                                        new CustomOAuth2UserService(
                                                                                applicationProperties,
                                                                                userService,
                                                                                loginAttemptService))
                                                                .userAuthoritiesMapper(
                                                                        userAuthoritiesMapper()))
                                        .permitAll());
            }

            // Handle SAML
            if (applicationProperties.getSecurity().isSaml2Activ()
                    && applicationProperties.getSystem().getEnableAlphaFunctionality()) {
                http.authenticationProvider(samlAuthenticationProvider());
                http.saml2Login(
                                saml2 ->
                                        saml2.loginPage("/saml2")
                                                .successHandler(
                                                        new CustomSaml2AuthenticationSuccessHandler(
                                                                loginAttemptService,
                                                                applicationProperties,
                                                                userService))
                                                .failureHandler(
                                                        new CustomSaml2AuthenticationFailureHandler())
                                                .permitAll())
                        .addFilterBefore(
                                userAuthenticationFilter, Saml2WebSsoAuthenticationFilter.class);
            }
        } else {
            if (applicationProperties.getSecurity().getCsrfDisabled()) {
                http.csrf(csrf -> csrf.disable());
            } else {
                CookieCsrfTokenRepository cookieRepo =
                        CookieCsrfTokenRepository.withHttpOnlyFalse();
                CsrfTokenRequestAttributeHandler requestHandler =
                        new CsrfTokenRequestAttributeHandler();
                requestHandler.setCsrfRequestAttributeName(null);
                http.csrf(
                        csrf ->
                                csrf.csrfTokenRepository(cookieRepo)
                                        .csrfTokenRequestHandler(requestHandler));
            }
            http.authorizeHttpRequests(authz -> authz.anyRequest().permitAll());
        }

        return http.build();
    }

    @Bean
    @ConditionalOnProperty(
            name = "security.saml2.enabled",
            havingValue = "true",
            matchIfMissing = false)
    public AuthenticationProvider samlAuthenticationProvider() {
        OpenSaml4AuthenticationProvider authenticationProvider =
                new OpenSaml4AuthenticationProvider();
        authenticationProvider.setResponseAuthenticationConverter(
                new CustomSaml2ResponseAuthenticationConverter(userService));
        return authenticationProvider;
    }

    // Client Registration Repository for OAUTH2 OIDC Login
    @Bean
    @ConditionalOnProperty(
            value = "security.oauth2.enabled",
            havingValue = "true",
            matchIfMissing = false)
    public ClientRegistrationRepository clientRegistrationRepository() {
        List<ClientRegistration> registrations = new ArrayList<>();

        githubClientRegistration().ifPresent(registrations::add);
        oidcClientRegistration().ifPresent(registrations::add);
        googleClientRegistration().ifPresent(registrations::add);
        keycloakClientRegistration().ifPresent(registrations::add);

        if (registrations.isEmpty()) {
            log.error("At least one OAuth2 provider must be configured");
            System.exit(1);
        }

        return new InMemoryClientRegistrationRepository(registrations);
    }

    private Optional<ClientRegistration> googleClientRegistration() {
        OAUTH2 oauth = applicationProperties.getSecurity().getOauth2();
        if (oauth == null || !oauth.getEnabled()) {
            return Optional.empty();
        }
        Client client = oauth.getClient();
        if (client == null) {
            return Optional.empty();
        }
        GoogleProvider google = client.getGoogle();
        return google != null && google.isSettingsValid()
                ? Optional.of(
                        ClientRegistration.withRegistrationId(google.getName())
                                .clientId(google.getClientId())
                                .clientSecret(google.getClientSecret())
                                .scope(google.getScopes())
                                .authorizationUri(google.getAuthorizationuri())
                                .tokenUri(google.getTokenuri())
                                .userInfoUri(google.getUserinfouri())
                                .userNameAttributeName(google.getUseAsUsername())
                                .clientName(google.getClientName())
                                .redirectUri("{baseUrl}/login/oauth2/code/" + google.getName())
                                .authorizationGrantType(
                                        org.springframework.security.oauth2.core
                                                .AuthorizationGrantType.AUTHORIZATION_CODE)
                                .build())
                : Optional.empty();
    }

    private Optional<ClientRegistration> keycloakClientRegistration() {
        OAUTH2 oauth = applicationProperties.getSecurity().getOauth2();
        if (oauth == null || !oauth.getEnabled()) {
            return Optional.empty();
        }
        Client client = oauth.getClient();
        if (client == null) {
            return Optional.empty();
        }
        KeycloakProvider keycloak = client.getKeycloak();

        return keycloak != null && keycloak.isSettingsValid()
                ? Optional.of(
                        ClientRegistrations.fromIssuerLocation(keycloak.getIssuer())
                                .registrationId(keycloak.getName())
                                .clientId(keycloak.getClientId())
                                .clientSecret(keycloak.getClientSecret())
                                .scope(keycloak.getScopes())
                                .userNameAttributeName(keycloak.getUseAsUsername())
                                .clientName(keycloak.getClientName())
                                .build())
                : Optional.empty();
    }

    private Optional<ClientRegistration> githubClientRegistration() {

        OAUTH2 oauth = applicationProperties.getSecurity().getOauth2();
        if (oauth == null || !oauth.getEnabled()) {
            return Optional.empty();
        }
        Client client = oauth.getClient();
        if (client == null) {
            return Optional.empty();
        }
        GithubProvider github = client.getGithub();
        return github != null && github.isSettingsValid()
                ? Optional.of(
                        ClientRegistration.withRegistrationId(github.getName())
                                .clientId(github.getClientId())
                                .clientSecret(github.getClientSecret())
                                .scope(github.getScopes())
                                .authorizationUri(github.getAuthorizationuri())
                                .tokenUri(github.getTokenuri())
                                .userInfoUri(github.getUserinfouri())
                                .userNameAttributeName(github.getUseAsUsername())
                                .clientName(github.getClientName())
                                .redirectUri("{baseUrl}/login/oauth2/code/" + github.getName())
                                .authorizationGrantType(
                                        org.springframework.security.oauth2.core
                                                .AuthorizationGrantType.AUTHORIZATION_CODE)
                                .build())
                : Optional.empty();
    }

    private Optional<ClientRegistration> oidcClientRegistration() {
        OAUTH2 oauth = applicationProperties.getSecurity().getOauth2();
        if (oauth == null
                || oauth.getIssuer() == null
                || oauth.getIssuer().isEmpty()
                || oauth.getClientId() == null
                || oauth.getClientId().isEmpty()
                || oauth.getClientSecret() == null
                || oauth.getClientSecret().isEmpty()
                || oauth.getScopes() == null
                || oauth.getScopes().isEmpty()
                || oauth.getUseAsUsername() == null
                || oauth.getUseAsUsername().isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(
                ClientRegistrations.fromIssuerLocation(oauth.getIssuer())
                        .registrationId("oidc")
                        .clientId(oauth.getClientId())
                        .clientSecret(oauth.getClientSecret())
                        .scope(oauth.getScopes())
                        .userNameAttributeName(oauth.getUseAsUsername())
                        .clientName("OIDC")
                        .build());
    }

    @Bean
    @ConditionalOnProperty(
            name = "security.saml2.enabled",
            havingValue = "true",
            matchIfMissing = false)
    public RelyingPartyRegistrationRepository relyingPartyRegistrations() throws Exception {

        SAML2 samlConf = applicationProperties.getSecurity().getSaml2();

        Resource privateKeyResource = samlConf.getPrivateKey();

        Resource certificateResource = samlConf.getSpCert();

        Saml2X509Credential signingCredential =
                new Saml2X509Credential(
                        CertificateUtils.readPrivateKey(privateKeyResource),
                        CertificateUtils.readCertificate(certificateResource),
                        Saml2X509CredentialType.SIGNING);

        X509Certificate idpCert = CertificateUtils.readCertificate(samlConf.getidpCert());

        Saml2X509Credential verificationCredential = Saml2X509Credential.verification(idpCert);

        RelyingPartyRegistration rp =
                RelyingPartyRegistration.withRegistrationId(samlConf.getRegistrationId())
                        .signingX509Credentials((c) -> c.add(signingCredential))
                        .assertingPartyDetails(
                                (details) ->
                                        details.entityId(samlConf.getIdpIssuer())
                                                .singleSignOnServiceLocation(
                                                        samlConf.getIdpSingleLoginUrl())
                                                .verificationX509Credentials(
                                                        (c) -> c.add(verificationCredential))
                                                .wantAuthnRequestsSigned(true))
                        .build();
        return new InMemoryRelyingPartyRegistrationRepository(rp);
    }

    @Bean
    public DaoAuthenticationProvider daoAuthenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    /*
    This following function is to grant Authorities to the OAUTH2 user from the values stored in the database.
    This is required for the internal; 'hasRole()' function to give out the correct role.
     */
    @Bean
    @ConditionalOnProperty(
            value = "security.oauth2.enabled",
            havingValue = "true",
            matchIfMissing = false)
    GrantedAuthoritiesMapper userAuthoritiesMapper() {
        return (authorities) -> {
            Set<GrantedAuthority> mappedAuthorities = new HashSet<>();

            authorities.forEach(
                    authority -> {
                        // Add existing OAUTH2 Authorities
                        mappedAuthorities.add(new SimpleGrantedAuthority(authority.getAuthority()));

                        // Add Authorities from database for existing user, if user is present.
                        if (authority instanceof OAuth2UserAuthority oauth2Auth) {
                            String useAsUsername =
                                    applicationProperties
                                            .getSecurity()
                                            .getOauth2()
                                            .getUseAsUsername();
                            Optional<User> userOpt =
                                    userService.findByUsernameIgnoreCase(
                                            (String) oauth2Auth.getAttributes().get(useAsUsername));
                            if (userOpt.isPresent()) {
                                User user = userOpt.get();
                                if (user != null) {
                                    mappedAuthorities.add(
                                            new SimpleGrantedAuthority(
                                                    userService.findRole(user).getAuthority()));
                                }
                            }
                        }
                    });
            return mappedAuthorities;
        };
    }

    @Bean
    public IPRateLimitingFilter rateLimitingFilter() {
        int maxRequestsPerIp = 1000000; // Example limit TODO add config level
        return new IPRateLimitingFilter(maxRequestsPerIp, maxRequestsPerIp);
    }

    @Bean
    public PersistentTokenRepository persistentTokenRepository() {
        return new JPATokenRepositoryImpl();
    }

    @Bean
    public boolean activSecurity() {
        return true;
    }

    //    // Only Dev test
    //    @Bean
    //    public WebSecurityCustomizer webSecurityCustomizer() {
    //        return (web) ->
    //                web.ignoring()
    //                        .requestMatchers(
    //                                "/css/**", "/images/**", "/js/**", "/**.svg",
    // "/pdfjs-legacy/**");
    //    }
}
