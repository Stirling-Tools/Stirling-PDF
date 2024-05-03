package stirling.software.SPDF.config.security;

import java.io.IOException;
import java.util.*;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.authority.mapping.GrantedAuthoritiesMapper;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.core.session.SessionRegistryImpl;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.ClientRegistrations;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2UserAuthority;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.rememberme.PersistentTokenRepository;
import org.springframework.security.web.savedrequest.NullRequestCache;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.User;
import stirling.software.SPDF.repository.JPATokenRepositoryImpl;

@Configuration
@EnableWebSecurity()
@EnableMethodSecurity
public class SecurityConfiguration {

    @Autowired private UserDetailsService userDetailsService;

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

    @Bean
    public SessionRegistry sessionRegistry() {
        return new SessionRegistryImpl();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.addFilterBefore(userAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        if (loginEnabledValue) {

            http.csrf(csrf -> csrf.disable());
            http.addFilterBefore(rateLimitingFilter(), UsernamePasswordAuthenticationFilter.class);
            http.addFilterAfter(firstLoginFilter, UsernamePasswordAuthenticationFilter.class);
            http.sessionManagement(
                    sessionManagement ->
                            sessionManagement
                                    .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                                    .maximumSessions(10)
                                    .maxSessionsPreventsLogin(false)
                                    .sessionRegistry(sessionRegistry())
                                    .expiredUrl("/login?logout=true"));

            http.formLogin(
                            formLogin ->
                                    formLogin
                                            .loginPage("/login")
                                            .successHandler(
                                                    new CustomAuthenticationSuccessHandler())
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
                                            .deleteCookies("JSESSIONID", "remember-me")
                                            .addLogoutHandler(
                                                    (request, response, authentication) -> {
                                                        HttpSession session =
                                                                request.getSession(false);
                                                        if (session != null) {
                                                            String sessionId = session.getId();
                                                            sessionRegistry()
                                                                    .removeSessionInformation(
                                                                            sessionId);
                                                        }
                                                    }))
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
                                                                || trimmedUri.endsWith(".svg")
                                                                || trimmedUri.startsWith(
                                                                        "/register")
                                                                || trimmedUri.startsWith("/error")
                                                                || trimmedUri.startsWith("/images/")
                                                                || trimmedUri.startsWith("/public/")
                                                                || trimmedUri.startsWith("/css/")
                                                                || trimmedUri.startsWith("/js/")
                                                                || trimmedUri.startsWith(
                                                                        "/api/v1/info/status");
                                                    })
                                            .permitAll()
                                            .anyRequest()
                                            .authenticated())
                    .userDetailsService(userDetailsService)
                    .authenticationProvider(authenticationProvider());

            // Handle OAUTH2 Logins
            if (applicationProperties.getSecurity().getOAUTH2().getEnabled()) {

                http.oauth2Login(
                        oauth2 ->
                                oauth2.loginPage("/oauth2")
                                        /*
                                        This Custom handler is used to check if the OAUTH2 user trying to log in, already exists in the database.
                                        If user exists, login proceeds as usual. If user does not exist, then it is autocreated but only if 'OAUTH2AutoCreateUser'
                                        is set as true, else login fails with an error message advising the same.
                                         */
                                        .successHandler(
                                                new AuthenticationSuccessHandler() {
                                                    @Override
                                                    public void onAuthenticationSuccess(
                                                            HttpServletRequest request,
                                                            HttpServletResponse response,
                                                            Authentication authentication)
                                                            throws ServletException, IOException {
                                                        OAuth2User oauthUser =
                                                                (OAuth2User)
                                                                        authentication
                                                                                .getPrincipal();
                                                        if (userService.processOAuth2PostLogin(
                                                                oauthUser.getAttribute("email"),
                                                                applicationProperties
                                                                        .getSecurity()
                                                                        .getOAUTH2()
                                                                        .getAutoCreateUser())) {
                                                            response.sendRedirect("/");
                                                        } else {
                                                            response.sendRedirect(
                                                                    "/logout?oauth2AutoCreateDisabled=true");
                                                        }
                                                    }
                                                })
                                        // Add existing Authorities from the database
                                        .userInfoEndpoint(
                                                userInfoEndpoint ->
                                                        userInfoEndpoint.userAuthoritiesMapper(
                                                                userAuthoritiesMapper())));
            }
        } else {
            http.csrf(csrf -> csrf.disable())
                    .authorizeHttpRequests(authz -> authz.anyRequest().permitAll());
        }

        return http.build();
    }

    // Client Registration Repository for OAUTH2 OIDC Login
    @Bean
    @ConditionalOnProperty(
            value = "security.oauth2.enabled",
            havingValue = "true",
            matchIfMissing = false)
    public ClientRegistrationRepository clientRegistrationRepository() {
        return new InMemoryClientRegistrationRepository(this.oidcClientRegistration());
    }

    private ClientRegistration oidcClientRegistration() {
        return ClientRegistrations.fromOidcIssuerLocation(
                        applicationProperties.getSecurity().getOAUTH2().getIssuer())
                .registrationId("oidc")
                .clientId(applicationProperties.getSecurity().getOAUTH2().getClientId())
                .clientSecret(applicationProperties.getSecurity().getOAUTH2().getClientSecret())
                .scope("openid", "profile", "email")
                .userNameAttributeName("email")
                .clientName("OIDC")
                .build();
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
                            Optional<User> userOpt =
                                    userService.findByUsernameIgnoreCase(
                                            (String) oauth2Auth.getAttributes().get("email"));
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
    public DaoAuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider();
        authProvider.setUserDetailsService(userDetailsService);
        authProvider.setPasswordEncoder(passwordEncoder());
        return authProvider;
    }

    @Bean
    public PersistentTokenRepository persistentTokenRepository() {
        return new JPATokenRepositoryImpl();
    }

    @Bean
    public boolean activSecurity() {
        return true;
    }
}
