package stirling.software.SPDF.config;

import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.config.annotation.ContentNegotiationConfigurer;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
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

    /**
     * Configure content negotiation to support both PDF responses and JSON error responses. This
     * allows error handlers to return JSON ProblemDetail even when the client sends Accept:
     * application/pdf, preventing 406 Not Acceptable errors.
     */
    @Override
    public void configureContentNegotiation(ContentNegotiationConfigurer configurer) {
        configurer
                // Don't use path extension for content type detection
                .favorParameter(false)
                // Use Accept header but don't fail if no match
                .ignoreAcceptHeader(false)
                // Default to JSON for error responses
                .defaultContentType(MediaType.APPLICATION_JSON, MediaType.APPLICATION_PDF)
                // Register common media types
                .mediaType("json", MediaType.APPLICATION_JSON)
                .mediaType("pdf", MediaType.APPLICATION_PDF)
                .mediaType("xml", MediaType.APPLICATION_XML);
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Cache hashed assets (JS/CSS with content hashes) for 1 year
        // These files have names like index-ChAS4tCC.js that change when content changes
        // Check customFiles/static first, then fall back to classpath
        registry.addResourceHandler("/assets/**")
                .addResourceLocations(
                        "file:"
                                + stirling.software.common.configuration.InstallationPathConfig
                                        .getStaticPath()
                                + "assets/",
                        "classpath:/static/assets/")
                .setCacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic());

        // Don't cache index.html - it needs to be fresh to reference latest hashed assets
        // Note: index.html is handled by ReactRoutingController for dynamic processing
        registry.addResourceHandler("/index.html")
                .addResourceLocations(
                        "file:"
                                + stirling.software.common.configuration.InstallationPathConfig
                                        .getStaticPath(),
                        "classpath:/static/")
                .setCacheControl(CacheControl.noCache().mustRevalidate());

        // Handle all other static resources (js, css, images, fonts, etc.)
        // Check customFiles/static first for user overrides
        registry.addResourceHandler("/**")
                .addResourceLocations(
                        "file:"
                                + stirling.software.common.configuration.InstallationPathConfig
                                        .getStaticPath(),
                        "classpath:/static/")
                .setCacheControl(CacheControl.maxAge(1, TimeUnit.HOURS));
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
                    .allowedOriginPatterns(
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
