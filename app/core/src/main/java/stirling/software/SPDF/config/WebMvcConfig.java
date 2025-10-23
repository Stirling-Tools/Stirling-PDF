package stirling.software.SPDF.config;

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

            String[] allowedOrigins = applicationProperties.getSystem()
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
