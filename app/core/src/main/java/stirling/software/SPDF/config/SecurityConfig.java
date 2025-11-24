package stirling.software.SPDF.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Security configuration that explicitly permits access to OpenAPI/Swagger endpoints.
 *
 * <p>This prevents Spring Security's default login page from being returned when the
 * :generateOpenApiDocs task tries to fetch /v1/api-docs during CI/build runs.
 */
@Configuration
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http.securityMatcher(
                        "/v1/api-docs/**",
                        "/v1/api-docs",
                        "/v3/api-docs/**",
                        "/v3/api-docs",
                        "/swagger-ui/**",
                        "/swagger-ui.html",
                        "/index.html",
                        "/v1/api-docs.yaml",
                        "/api-docs/**",
                        "/actuator/health",
                        "/actuator/info",
                        "/favicon.ico")
                .csrf(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .formLogin(AbstractHttpConfigurer::disable);

        return http.build();
    }
}
