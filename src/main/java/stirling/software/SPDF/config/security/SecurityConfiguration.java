package stirling.software.SPDF.config.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityCustomizer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.mapping.GrantedAuthoritiesMapper;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.saml2.provider.service.authentication.OpenSaml4AuthenticationProvider;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.web.authentication.Saml2WebSsoAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.rememberme.PersistentTokenRepository;
import org.springframework.security.web.savedrequest.NullRequestCache;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;

import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.config.security.oauth2.CustomOAuth2AuthenticationFailureHandler;
import stirling.software.SPDF.config.security.oauth2.CustomOAuth2AuthenticationSuccessHandler;
import stirling.software.SPDF.config.security.oauth2.CustomOAuth2LogoutSuccessHandler;
import stirling.software.SPDF.config.security.oauth2.CustomOAuth2UserService;
import stirling.software.SPDF.config.security.saml.ConvertResponseToAuthentication;
import stirling.software.SPDF.config.security.saml.CustomSAMLAuthenticationFailureHandler;
import stirling.software.SPDF.config.security.saml.CustomSAMLAuthenticationSuccessHandler;
import stirling.software.SPDF.config.security.session.SessionPersistentRegistry;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.repository.JPATokenRepositoryImpl;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@Slf4j
public class SecurityConfiguration {

    @Autowired private CustomUserDetailsService userDetailsService;

    @Autowired(required = false)
    private GrantedAuthoritiesMapper userAuthoritiesMapper;

    @Autowired(required = false)
    private RelyingPartyRegistrationRepository relyingPartyRegistrationRepository;

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

    @Autowired private ConvertResponseToAuthentication convertResponseToAuthentication;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authenticationManager(authenticationManager(http));

        if (loginEnabledValue) {
            http.addFilterBefore(
                    userAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
            http.csrf(csrf -> csrf.disable());
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

            http.formLogin(
                            formLogin ->
                                    formLogin
                                            .loginPage("/login")
                                            .successHandler(
                                                    new CustomAuthenticationSuccessHandler(
                                                            loginAttemptService, userService))
                                            .defaultSuccessUrl("/")
                                            .failureHandler(
                                                    new CustomAuthenticationFailureHandler(
                                                            loginAttemptService, userService))
                                            .permitAll())
                    .requestCache(requestCache -> requestCache.requestCache(new NullRequestCache()))
                    .logout(
                            logout ->
                                    logout.logoutRequestMatcher(
                                                    new AntPathRequestMatcher("/logout"))
                                            .logoutSuccessHandler(new CustomLogoutSuccessHandler())
                                            .invalidateHttpSession(true) // Invalidate session
                                            .deleteCookies("JSESSIONID", "remember-me"))
                    .rememberMe(
                            rememberMeConfigurer ->
                                    rememberMeConfigurer // Use the configurator directly
                                            .key("uniqueAndSecret")
                                            .tokenRepository(persistentTokenRepository())
                                            .tokenValiditySeconds(1209600) // 2 weeks
                            )
                    .authorizeHttpRequests(
                            authz ->
                                    authz.requestMatchers(
                                                    req -> {
                                                        String uri = req.getRequestURI();
                                                        String contextPath = req.getContextPath();

                                                        // Remove the context path from the URI
                                                        String trimmedUri =
                                                                uri.startsWith(contextPath)
                                                                        ? uri.substring(
                                                                                contextPath
                                                                                        .length())
                                                                        : uri;

                                                        return trimmedUri.startsWith("/login")
                                                                || trimmedUri.startsWith("/oauth")
                                                                || trimmedUri.startsWith("/saml2")
                                                                || trimmedUri.endsWith(".svg")
                                                                || trimmedUri.startsWith(
                                                                        "/register")
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

            // Handle OAUTH2 Logins
            if (applicationProperties.getSecurity().getOauth2() != null
                    && applicationProperties.getSecurity().getOauth2().getEnabled()
                    && !applicationProperties
                            .getSecurity()
                            .getLoginMethod()
                            .equalsIgnoreCase("normal")) {

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
                                                                                userAuthoritiesMapper)))
                        .logout(
                                logout ->
                                        logout.logoutSuccessHandler(
                                                new CustomOAuth2LogoutSuccessHandler(
                                                        applicationProperties)));
            }

            // Handle SAML
            if (applicationProperties.getSecurity().getSaml() != null
                    && applicationProperties.getSecurity().getSaml().getEnabled()
                    && !applicationProperties
                            .getSecurity()
                            .getLoginMethod()
                            .equalsIgnoreCase("normal")) {
                http.saml2Login(
                                saml2 -> {
                                    saml2.loginPage("/saml2")
                                            .relyingPartyRegistrationRepository(
                                                    relyingPartyRegistrationRepository)
                                            .successHandler(
                                                    new CustomSAMLAuthenticationSuccessHandler(
                                                            loginAttemptService,
                                                            userService,
                                                            applicationProperties))
                                            .failureHandler(
                                                    new CustomSAMLAuthenticationFailureHandler());
                                })
                        .addFilterBefore(
                                userAuthenticationFilter, Saml2WebSsoAuthenticationFilter.class);
            }
        } else {
            http.csrf(csrf -> csrf.disable())
                    .authorizeHttpRequests(authz -> authz.anyRequest().permitAll());
        }

        return http.build();
    }

    @Bean
    public AuthenticationProvider samlAuthenticationProvider() {
        OpenSaml4AuthenticationProvider authenticationProvider =
                new OpenSaml4AuthenticationProvider();
        authenticationProvider.setResponseAuthenticationConverter(convertResponseToAuthentication);
        return authenticationProvider;
    }

    @Bean
    public AuthenticationProvider daoAuthenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService); // UserDetailsService
        provider.setPasswordEncoder(passwordEncoder()); // PasswordEncoder
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(HttpSecurity http) throws Exception {
        AuthenticationManagerBuilder authenticationManagerBuilder =
                http.getSharedObject(AuthenticationManagerBuilder.class);

        authenticationManagerBuilder
                .authenticationProvider(daoAuthenticationProvider()) // Benutzername/Passwort
                .authenticationProvider(samlAuthenticationProvider()); // SAML

        return authenticationManagerBuilder.build();
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
//                                "/css/**", "/images/**", "/js/**", "/**.svg", "/pdfjs-legacy/**");
//    }
}
