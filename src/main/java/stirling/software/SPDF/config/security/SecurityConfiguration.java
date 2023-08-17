package stirling.software.SPDF.config.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityConfiguration;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
@Configuration
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
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception  {
    	http.addFilterBefore(userAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        
    	if(loginEnabledValue) {
    		
	    	http.csrf().disable();
	        http
	            .formLogin(formLogin -> formLogin
	                .loginPage("/login")
	                .defaultSuccessUrl("/")
	                .failureHandler(new CustomAuthenticationFailureHandler())
	                .permitAll()
	            )
	            .logout(logout -> logout
	            		.logoutRequestMatcher(new AntPathRequestMatcher("/logout"))
	                    .logoutSuccessUrl("/login?logout=true")
	                    .invalidateHttpSession(true)        // Invalidate session
	                    .deleteCookies("JSESSIONID") 
	            )
	            .authorizeHttpRequests(authz -> authz
	                    .requestMatchers(req -> req.getRequestURI().startsWith("/login") || req.getRequestURI().endsWith(".svg") || req.getRequestURI().startsWith("/register") || req.getRequestURI().startsWith("/error") || req.getRequestURI().startsWith("/images/") ||  req.getRequestURI().startsWith("/public/") || req.getRequestURI().startsWith("/css/") || req.getRequestURI().startsWith("/js/"))
	                    .permitAll()
	                    .anyRequest().authenticated()
	                )
	            .userDetailsService(userDetailsService)
	            .authenticationProvider(authenticationProvider());
    	} else {
    		 http
             .csrf().disable()
             .authorizeHttpRequests(authz -> authz
                 .anyRequest().permitAll()
             );
    	}
        return http.build();
    }


    
    @Bean
    public DaoAuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider();
        authProvider.setUserDetailsService(userDetailsService);
        authProvider.setPasswordEncoder(passwordEncoder());
        return authProvider;
    }
    
    
    
}

