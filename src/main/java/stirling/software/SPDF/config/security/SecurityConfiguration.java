package stirling.software.SPDF.config.security;

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
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.authority.mapping.GrantedAuthoritiesMapper;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.core.session.SessionRegistryImpl;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.ClientRegistrations;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.user.OAuth2UserAuthority;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.rememberme.PersistentTokenRepository;
import org.springframework.security.web.savedrequest.NullRequestCache;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;

import stirling.software.SPDF.config.security.oauth2.CustomOAuth2AuthenticationFailureHandler;
import stirling.software.SPDF.config.security.oauth2.CustomOAuth2AuthenticationSuccessHandler;
import stirling.software.SPDF.config.security.oauth2.CustomOAuth2LogoutSuccessHandler;
import stirling.software.SPDF.config.security.oauth2.CustomOAuth2UserService;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.SPDF.model.User;
import stirling.software.SPDF.repository.JPATokenRepositoryImpl;

@Configuration
@EnableWebSecurity()
@EnableMethodSecurity
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
                                                        new CustomOAuth2AuthenticationSuccessHandler(
                                                                applicationProperties, userService))
                                                .failureHandler(
                                                        new CustomOAuth2AuthenticationFailureHandler())
                                                // Add existing Authorities from the database
                                                .userInfoEndpoint(
                                                        userInfoEndpoint ->
                                                                userInfoEndpoint
                                                                        .oidcUserService(
                                                                                new CustomOAuth2UserService(
                                                                                        applicationProperties))
                                                                        .userAuthoritiesMapper(
                                                                                userAuthoritiesMapper())))
                        .userDetailsService(userDetailsService)
                        .logout(
                                logout ->
                                        logout.logoutSuccessHandler(
                                                new CustomOAuth2LogoutSuccessHandler(
                                                        this.applicationProperties)));
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
        OAUTH2 oauth = applicationProperties.getSecurity().getOAUTH2();
        return ClientRegistrations.fromIssuerLocation(oauth.getIssuer())
                .registrationId("oidc")
                .clientId(oauth.getClientId())
                .clientSecret(oauth.getClientSecret())
                .scope(oauth.getScopes())
                .userNameAttributeName(oauth.getUseAsUsername())
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
                            String useAsUsername =
                                    applicationProperties
                                            .getSecurity()
                                            .getOAUTH2()
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
