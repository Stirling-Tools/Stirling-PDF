package stirling.software.SPDF.config;

import jakarta.annotation.PostConstruct;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Slf4j
@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final EndpointInterceptor endpointInterceptor;
    private final ApplicationProperties applicationProperties;

    /**
     * Validates CORS configuration on application startup to prevent runtime errors
     * Spring will reject allowCredentials(true) + allowedOrigins("*") at runtime
     * This validation provides a clear error message during startup instead
     */
    @PostConstruct
    public void validateCorsConfiguration() {
        if (applicationProperties.getSystem() != null
                && applicationProperties.getSystem().getCorsAllowedOrigins() != null
                && !applicationProperties.getSystem().getCorsAllowedOrigins().isEmpty()) {

            var allowedOrigins = applicationProperties.getSystem().getCorsAllowedOrigins();

            // Check if wildcard "*" is used with credentials
            if (allowedOrigins.contains("*")) {
                String errorMessage =
                        "INVALID CORS CONFIGURATION: Cannot use allowedOrigins=[\"*\"] with allowCredentials=true.\n"
                                + "This configuration is rejected by Spring Security at runtime.\n"
                                + "Please specify exact origins in system.corsAllowedOrigins (e.g., [\"http://localhost:3000\", \"https://example.com\"])\n"
                                + "or remove credentials support by modifying WebMvcConfig.";
                log.error(errorMessage);
                throw new IllegalStateException(errorMessage);
            }

            log.info(
                    "CORS configuration validated successfully. Allowed origins: {}",
                    allowedOrigins);
        }
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(endpointInterceptor);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // Only configure CORS if allowed origins are specified
        if (applicationProperties.getSystem() != null
                && applicationProperties.getSystem().getCorsAllowedOrigins() != null
                && !applicationProperties.getSystem().getCorsAllowedOrigins().isEmpty()) {

            String[] allowedOrigins =
                    applicationProperties
                            .getSystem()
                            .getCorsAllowedOrigins()
                            .toArray(new String[0]);

            registry.addMapping("/**")
                    .allowedOrigins(allowedOrigins)
                    .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH")
                    .allowedHeaders("*")
                    .allowCredentials(true)
                    .maxAge(3600);
        }
        // If no origins are configured, CORS is not enabled (secure by default)
    }

    // @Override
    // public void addResourceHandlers(ResourceHandlerRegistry registry) {
    //     // Handler for external static resources - DISABLED in backend-only mode
    //     registry.addResourceHandler("/**")
    //             .addResourceLocations(
    //                     "file:" + InstallationPathConfig.getStaticPath(), "classpath:/static/");
    //     // .setCachePeriod(0); // Optional: disable caching
    // }
}
