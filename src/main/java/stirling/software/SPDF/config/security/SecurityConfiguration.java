package stirling.software.SPDF.config.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.core.session.SessionRegistryImpl;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.rememberme.PersistentTokenRepository;
import org.springframework.security.web.savedrequest.NullRequestCache;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;

import jakarta.servlet.http.HttpSession;
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
                                    .maximumSessions(1)
                                    .maxSessionsPreventsLogin(true)
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
                                            .logoutSuccessUrl("/login?logout=true")
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
        } else {
            http.csrf(csrf -> csrf.disable())
                    .authorizeHttpRequests(authz -> authz.anyRequest().permitAll());
        }

        return http.build();
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
}
