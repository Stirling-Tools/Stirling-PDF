package stirling.software.SPDF.config.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.method.configuration.EnableGlobalMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.rememberme.PersistentTokenRepository;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;

import stirling.software.SPDF.repository.JPATokenRepositoryImpl;
@Configuration
@EnableWebSecurity()
@EnableGlobalMethodSecurity(prePostEnabled = true)
public class SecurityConfiguration {

    @Autowired
    private UserDetailsService userDetailsService;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
    @Autowired
    @Lazy
    private UserService userService;
    
    @Autowired
    @Qualifier("loginEnabled")
    public boolean loginEnabledValue;
    
    @Autowired
    private UserAuthenticationFilter userAuthenticationFilter;

    @Autowired
    private CustomAuthenticationSuccessHandler customAuthenticationSuccessHandler;
    

    @Autowired
    private  LoginAttemptService loginAttemptService;
    
    @Autowired
    private FirstLoginFilter firstLoginFilter;
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception  {
    	http.addFilterBefore(userAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        
    	if(loginEnabledValue) {
    		
    		http.csrf(csrf -> csrf.disable());
    		http.addFilterBefore(rateLimitingFilter(), UsernamePasswordAuthenticationFilter.class);
    		http.addFilterAfter(firstLoginFilter, UsernamePasswordAuthenticationFilter.class);
	        http
	            .formLogin(formLogin -> formLogin
	                .loginPage("/login")
	                .successHandler(customAuthenticationSuccessHandler)
	               // .defaultSuccessUrl("/")
	                .failureHandler(new CustomAuthenticationFailureHandler(loginAttemptService))
	                .permitAll()
	            )
	            .logout(logout -> logout
	            		.logoutRequestMatcher(new AntPathRequestMatcher("/logout"))
	                    .logoutSuccessUrl("/login?logout=true")
	                    .invalidateHttpSession(true)        // Invalidate session
	                    .deleteCookies("JSESSIONID", "remember-me") 
	            ).rememberMe(rememberMeConfigurer -> rememberMeConfigurer // Use the configurator directly
                    .key("uniqueAndSecret")
                    .tokenRepository(persistentTokenRepository())
                    .tokenValiditySeconds(1209600) // 2 weeks
                )
	            .authorizeHttpRequests(authz -> authz
	                    .requestMatchers(req -> req.getRequestURI().startsWith("/login") || req.getRequestURI().endsWith(".svg") || req.getRequestURI().startsWith("/register") || req.getRequestURI().startsWith("/error") || req.getRequestURI().startsWith("/images/") ||  req.getRequestURI().startsWith("/public/") || req.getRequestURI().startsWith("/css/") || req.getRequestURI().startsWith("/js/"))
	                    .permitAll()
	                    .anyRequest().authenticated()
	                )
	            .userDetailsService(userDetailsService)
	            .authenticationProvider(authenticationProvider());
    	} else {
    		 http.csrf(csrf -> csrf.disable())
             .authorizeHttpRequests(authz -> authz
                 .anyRequest().permitAll()
             );
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

