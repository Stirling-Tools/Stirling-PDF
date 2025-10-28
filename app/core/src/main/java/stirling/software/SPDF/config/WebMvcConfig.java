package stirling.software.SPDF.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final EndpointInterceptor endpointInterceptor;
    private final ApplicationProperties applicationProperties;

    private static final Logger logger = LoggerFactory.getLogger(WebMvcConfig.class);

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

            logger.info(
                    "Configuring CORS with allowed origins: {}",
                    applicationProperties.getSystem().getCorsAllowedOrigins());

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
}
