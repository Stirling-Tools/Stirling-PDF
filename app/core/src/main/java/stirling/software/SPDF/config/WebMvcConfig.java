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
        // Check if running in Tauri mode
        boolean isTauriMode =
                Boolean.parseBoolean(System.getProperty("STIRLING_PDF_TAURI_MODE", "false"));

        // Check if user has configured custom origins
        boolean hasConfiguredOrigins =
                applicationProperties.getSystem() != null
                        && applicationProperties.getSystem().getCorsAllowedOrigins() != null
                        && !applicationProperties.getSystem().getCorsAllowedOrigins().isEmpty();

        if (isTauriMode) {
            // Automatically enable CORS for Tauri desktop app
            // Tauri v1 uses tauri://localhost, v2 uses http(s)://tauri.localhost
            logger.info("Tauri mode detected - enabling CORS for Tauri protocols (v1 and v2)");
            registry.addMapping("/**")
                    .allowedOrigins(
                            "tauri://localhost",
                            "http://tauri.localhost",
                            "https://tauri.localhost")
                    .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                    .allowedHeaders(
                            "Authorization",
                            "Content-Type",
                            "X-Requested-With",
                            "Accept",
                            "Origin",
                            "X-API-KEY",
                            "X-CSRF-TOKEN",
                            "X-XSRF-TOKEN",
                            "X-Browser-Id")
                    .exposedHeaders(
                            "WWW-Authenticate",
                            "X-Total-Count",
                            "X-Page-Number",
                            "X-Page-Size",
                            "Content-Disposition",
                            "Content-Type")
                    .allowCredentials(true)
                    .maxAge(3600);
        } else if (hasConfiguredOrigins) {
            // Use user-configured origins
            logger.info(
                    "Configuring CORS with allowed origins: {}",
                    applicationProperties.getSystem().getCorsAllowedOrigins());

            String[] allowedOrigins =
                    applicationProperties
                            .getSystem()
                            .getCorsAllowedOrigins()
                            .toArray(new String[0]);

            registry.addMapping("/**")
                    .allowedOriginPatterns(allowedOrigins)
                    .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                    .allowedHeaders(
                            "Authorization",
                            "Content-Type",
                            "X-Requested-With",
                            "Accept",
                            "Origin",
                            "X-API-KEY",
                            "X-CSRF-TOKEN",
                            "X-XSRF-TOKEN",
                            "X-Browser-Id")
                    .exposedHeaders(
                            "WWW-Authenticate",
                            "X-Total-Count",
                            "X-Page-Number",
                            "X-Page-Size",
                            "Content-Disposition",
                            "Content-Type")
                    .allowCredentials(true)
                    .maxAge(3600);
        } else {
            // Default to allowing all origins when nothing is configured
            logger.info(
                    "No CORS allowed origins configured in settings.yml (system.corsAllowedOrigins); allowing all origins.");
            registry.addMapping("/**")
                    .allowedOriginPatterns("*")
                    .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                    .allowedHeaders(
                            "Authorization",
                            "Content-Type",
                            "X-Requested-With",
                            "Accept",
                            "Origin",
                            "X-API-KEY",
                            "X-CSRF-TOKEN",
                            "X-XSRF-TOKEN",
                            "X-Browser-Id")
                    .exposedHeaders(
                            "WWW-Authenticate",
                            "X-Total-Count",
                            "X-Page-Number",
                            "X-Page-Size",
                            "Content-Disposition",
                            "Content-Type")
                    .allowCredentials(true)
                    .maxAge(3600);
        }
    }
}
