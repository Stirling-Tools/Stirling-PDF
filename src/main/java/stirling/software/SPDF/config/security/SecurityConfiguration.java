package stirling.software.SPDF.config.security;

import io.github.pixee.security.Newlines;
import java.io.IOException;
import java.security.cert.X509Certificate;
import java.util.*;

import org.opensaml.saml.saml2.core.AuthnRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.io.Resource;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.ProviderManager;
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
import org.springframework.security.saml2.provider.service.authentication.AbstractSaml2AuthenticationRequest;
import org.springframework.security.saml2.provider.service.authentication.OpenSaml4AuthenticationProvider;
import org.springframework.security.saml2.provider.service.registration.InMemoryRelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistration;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.registration.Saml2MessageBinding;
import org.springframework.security.saml2.provider.service.web.HttpSessionSaml2AuthenticationRequestRepository;
import org.springframework.security.saml2.provider.service.web.Saml2AuthenticationRequestRepository;
import org.springframework.security.saml2.provider.service.web.authentication.OpenSaml4AuthenticationRequestResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.rememberme.PersistentTokenRepository;
import org.springframework.security.web.authentication.session.RegisterSessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.savedrequest.NullRequestCache;
import org.springframework.security.web.session.ForceEagerSessionCreationFilter;
import org.springframework.security.web.session.HttpSessionEventPublisher;
import org.springframework.security.web.session.SessionManagementFilter;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
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
@DependsOn("runningEE")
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

    @Autowired
    @Qualifier("runningEE")
    public boolean runningEE;

    @Autowired ApplicationProperties applicationProperties;

    @Autowired private UserAuthenticationFilter userAuthenticationFilter;

    @Autowired private LoginAttemptService loginAttemptService;

    @Autowired private FirstLoginFilter firstLoginFilter;
    @Autowired private SessionPersistentRegistry sessionRegistry;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        if (applicationProperties.getSecurity().getCsrfDisabled()) {
            http.csrf(csrf -> csrf.disable());
        }

        if (loginEnabledValue) {
            http.addFilterBefore(
                    userAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
            if (!applicationProperties.getSecurity().getCsrfDisabled()) {
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
                                    .maximumSessions(10)
                                    .maxSessionsPreventsLogin(false)
                                    .sessionRegistry(sessionRegistry)

                                    .expiredUrl("/login?logout=true"))
            .addFilterBefore(
                    new ForceEagerSessionCreationFilter(), 
                    SecurityContextHolderFilter.class)
            .addFilterBefore(new ForceEagerSessionCreationFilter(), SecurityContextHolderFilter.class);
            
            http.addFilterBefore(new OncePerRequestFilter() {
                @Override
                protected void doFilterInternal(HttpServletRequest request, 
                        HttpServletResponse response, FilterChain filterChain) 
                        throws ServletException, IOException {
                    
                    if (request.getRequestURI().startsWith("/saml2")) {
                        response.setHeader("Set-Cookie", 
                            Newlines.stripAll(response.getHeader("Set-Cookie")
                                .concat(";SameSite=None;Secure")));
                    }
                    filterChain.doFilter(request, response);
                }
            }, SessionManagementFilter.class);
            
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
            if (applicationProperties.getSecurity().isSaml2Activ()) { // && runningEE
                // Configure the authentication provider
                OpenSaml4AuthenticationProvider authenticationProvider =
                        new OpenSaml4AuthenticationProvider();
                authenticationProvider.setResponseAuthenticationConverter(
                        new CustomSaml2ResponseAuthenticationConverter(userService));

                http.authenticationProvider(authenticationProvider)
                        .saml2Login(
                                saml2 -> {
                                    try {
                                        saml2.loginPage("/saml2")
                                                .relyingPartyRegistrationRepository(
                                                        relyingPartyRegistrations())
                                                .authenticationManager(
                                                        new ProviderManager(authenticationProvider))
                                     
                                                .successHandler(
                                                        new CustomSaml2AuthenticationSuccessHandler(
                                                                loginAttemptService,
                                                                applicationProperties,
                                                                userService))
                                                .failureHandler(
                                                        new CustomSaml2AuthenticationFailureHandler())
                                                .authenticationRequestResolver(
                                                        authenticationRequestResolver(
                                                                relyingPartyRegistrations()));
                                    } catch (Exception e) {
                                        log.error("Error configuring SAML2 login", e);
                                        throw new RuntimeException(e);
                                    }
                                });
            }

        } else {
            if (!applicationProperties.getSecurity().getCsrfDisabled()) {
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
    public CookieSerializer cookieSerializer() {
        DefaultCookieSerializer serializer = new DefaultCookieSerializer();
        serializer.setSameSite("None");
        serializer.setUseSecureCookie(true); // Required when using SameSite=None
        return serializer;
    }

    @Bean
    public HttpSessionEventPublisher httpSessionEventPublisher() {
        return new HttpSessionEventPublisher();
    }
    
    @Bean
    @ConditionalOnProperty(
            name = "security.saml2.enabled",
            havingValue = "true",
            matchIfMissing = false)
    public RelyingPartyRegistrationRepository relyingPartyRegistrations() throws Exception {
        SAML2 samlConf = applicationProperties.getSecurity().getSaml2();

        X509Certificate idpCert = CertificateUtils.readCertificate(samlConf.getidpCert());
        Saml2X509Credential verificationCredential = Saml2X509Credential.verification(idpCert);

        Resource privateKeyResource = samlConf.getPrivateKey();
        Resource certificateResource = samlConf.getSpCert();

        Saml2X509Credential signingCredential =
                new Saml2X509Credential(
                        CertificateUtils.readPrivateKey(privateKeyResource),
                        CertificateUtils.readCertificate(certificateResource),
                        Saml2X509CredentialType.SIGNING);

        RelyingPartyRegistration rp =
                RelyingPartyRegistration.withRegistrationId(samlConf.getRegistrationId())
                        .signingX509Credentials(c -> c.add(signingCredential))
                        .assertingPartyMetadata(
                                metadata ->
                                        metadata.entityId(samlConf.getIdpIssuer())
                                                .singleSignOnServiceLocation(
                                                        samlConf.getIdpSingleLoginUrl())
                                                .verificationX509Credentials(
                                                        c -> c.add(verificationCredential))
                                                .singleSignOnServiceBinding(
                                                        Saml2MessageBinding.POST)
                                                .wantAuthnRequestsSigned(true))
                        .build();

        return new InMemoryRelyingPartyRegistrationRepository(rp);
    }

    @Bean
    @ConditionalOnProperty(
            name = "security.saml2.enabled",
            havingValue = "true",
            matchIfMissing = false)
    public OpenSaml4AuthenticationRequestResolver authenticationRequestResolver(
            RelyingPartyRegistrationRepository relyingPartyRegistrationRepository) {
        OpenSaml4AuthenticationRequestResolver resolver =
                new OpenSaml4AuthenticationRequestResolver(relyingPartyRegistrationRepository);
        resolver.setAuthnRequestCustomizer(
                customizer -> {
                    log.debug("Customizing SAML Authentication request");

                    AuthnRequest authnRequest = customizer.getAuthnRequest();
                    log.debug("AuthnRequest ID: {}", authnRequest.getID());
                    
                    if (authnRequest.getID() == null) {
                        authnRequest.setID("ARQ" + UUID.randomUUID().toString());
                    }
                    log.debug("AuthnRequest new ID after set: {}", authnRequest.getID());
                    log.debug("AuthnRequest IssueInstant: {}", authnRequest.getIssueInstant());
                    log.debug(
                            "AuthnRequest Issuer: {}",
                            authnRequest.getIssuer() != null
                                    ? authnRequest.getIssuer().getValue()
                                    : "null");

                    HttpServletRequest request = customizer.getRequest();

                    // Log HTTP request details
                    log.debug("HTTP Request Method: {}", request.getMethod());
                    log.debug("Request URI: {}", request.getRequestURI());
                    log.debug("Request URL: {}", request.getRequestURL().toString());
                    log.debug("Query String: {}", request.getQueryString());
                    log.debug("Remote Address: {}", request.getRemoteAddr());

                    // Log headers
                    Collections.list(request.getHeaderNames())
                            .forEach(
                                    headerName -> {
                                        log.debug(
                                                "Header - {}: {}",
                                                headerName,
                                                request.getHeader(headerName));
                                    });

                    // Log SAML specific parameters
                    log.debug("SAML Request Parameters:");
                    log.debug("SAMLRequest: {}", request.getParameter("SAMLRequest"));
                    log.debug("RelayState: {}", request.getParameter("RelayState"));

                    // Log session debugrmation if exists
                    if (request.getSession(false) != null) {
                        log.debug("Session ID: {}", request.getSession().getId());
                    }

                    // Log any assertions consumer service details if present
                    if (authnRequest.getAssertionConsumerServiceURL() != null) {
                        log.debug(
                                "AssertionConsumerServiceURL: {}",
                                authnRequest.getAssertionConsumerServiceURL());
                    }

                    // Log NameID policy if present
                    if (authnRequest.getNameIDPolicy() != null) {
                        log.debug(
                                "NameIDPolicy Format: {}",
                                authnRequest.getNameIDPolicy().getFormat());
                    }
                });
        return resolver;
    }

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
