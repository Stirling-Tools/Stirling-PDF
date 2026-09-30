package stirling.software.SPDF.config;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.EncodedResourceResolver;
import org.springframework.web.servlet.resource.HttpResource;
import org.springframework.web.servlet.resource.ResourceResolver;
import org.springframework.web.servlet.resource.ResourceResolverChain;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final EndpointInterceptor endpointInterceptor;
    private final PdfMetricsInterceptor pdfMetricsInterceptor;
    private final ApplicationProperties applicationProperties;

    private static final Logger logger = LoggerFactory.getLogger(WebMvcConfig.class);

    private static final CacheControl NO_CACHE = CacheControl.noCache();
    private static final CacheControl IMMUTABLE_ONE_YEAR =
            CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic().immutable();

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(endpointInterceptor);
        registry.addInterceptor(pdfMetricsInterceptor);
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String staticPath =
                "file:"
                        + stirling.software.common.configuration.InstallationPathConfig
                                .getStaticPath();

        // 1. Service worker and PWA metadata (never store)
        // Browsers revalidate SW bytes anyway; no-store is the safest for atomic updates.
        registry.addResourceHandler(
                        "/sw.js", "/manifest.json", "/site.webmanifest", "/browserconfig.xml")
                .addResourceLocations(staticPath, "classpath:/static/")
                .setCacheControl(CacheControl.noStore())
                .resourceChain(true)
                .addResolver(new PreferredEncodingResourceResolver());

        // 2. Vite fingerprinted assets (immutable)
        // These already have content hashes in filenames (e.g. index-ChAS4tCC.js)
        registry.addResourceHandler("/assets/**")
                .addResourceLocations(staticPath + "assets/", "classpath:/static/assets/")
                .setCacheControl(IMMUTABLE_ONE_YEAR)
                .resourceChain(true)
                .addResolver(new PreferredEncodingResourceResolver());

        // 3. Media and fonts (immutable)
        registry.addResourceHandler("/images/**", "/fonts/**")
                .addResourceLocations(
                        staticPath + "images/",
                        "classpath:/static/images/",
                        staticPath + "fonts/",
                        "classpath:/static/fonts/")
                .setCacheControl(IMMUTABLE_ONE_YEAR)
                .resourceChain(true)
                .addResolver(new PreferredEncodingResourceResolver());

        // 4. Branding and stable non-fingerprinted assets (1 day + SWR)
        // Use stale-while-revalidate to improve perceived performance.
        registry.addResourceHandler(
                        "/favicon.*",
                        "/apple-touch-icon.png",
                        "/android-chrome-*.png",
                        "/mstile-*.png",
                        "/safari-pinned-tab.svg",
                        "/icons/**",
                        "/modern-logo/**",
                        "/3rdPartyLicenses.json",
                        "/pdfjs/**",
                        "/pdfjs-legacy/**",
                        "/pdfium/**",
                        "/locales/**",
                        "/css/**",
                        "/js/**",
                        "/vendor/**",
                        "/samples/**",
                        "/og_images/**",
                        "/Login/**")
                .addResourceLocations(
                        staticPath,
                        "classpath:/static/",
                        staticPath + "pdfjs/",
                        "classpath:/static/pdfjs/",
                        staticPath + "pdfjs-legacy/",
                        "classpath:/static/pdfjs-legacy/",
                        staticPath + "pdfium/",
                        "classpath:/static/pdfium/",
                        staticPath + "locales/",
                        "classpath:/static/locales/",
                        staticPath + "css/",
                        "classpath:/static/css/",
                        staticPath + "js/",
                        "classpath:/static/js/",
                        staticPath + "vendor/",
                        "classpath:/static/vendor/",
                        staticPath + "samples/",
                        "classpath:/static/samples/",
                        staticPath + "og_images/",
                        "classpath:/static/og_images/",
                        staticPath + "Login/",
                        "classpath:/static/Login/",
                        staticPath + "icons/",
                        "classpath:/static/icons/",
                        staticPath + "modern-logo/",
                        "classpath:/static/modern-logo/")
                .setCacheControl(
                        CacheControl.maxAge(Duration.ofDays(1))
                                .cachePublic()
                                .staleWhileRevalidate(Duration.ofDays(7)))
                .resourceChain(true)
                .addResolver(new PreferredEncodingResourceResolver());

        // 5. Catch-all (SPA fallback)
        // Must check with server to ensure index.html is always fresh.
        registry.addResourceHandler("/**")
                .addResourceLocations(staticPath, "classpath:/static/")
                .setCacheControl(NO_CACHE)
                .resourceChain(true)
                .addResolver(new PreferredEncodingResourceResolver());
    }

    /**
     * Serves the smallest precompressed variant the client accepts, in server preference order
     * (brotli before gzip). The framework resolver walks the client's Accept-Encoding in the order
     * sent, and browsers list gzip before br, so the brotli siblings were never selected (Spring
     * Framework #37210). This applies the preference upstream is adopting in #37213 by asking a
     * single-coding resolver per coding; remove it when the pinned Spring version carries the fix.
     * Quality factors are ignored, matching the upstream behavior.
     */
    static final class PreferredEncodingResourceResolver implements ResourceResolver {

        private record Coding(String name, EncodedResourceResolver resolver) {}

        private final List<Coding> codings;

        PreferredEncodingResourceResolver() {
            this.codings =
                    Stream.of("br", "gzip")
                            .map(
                                    name -> {
                                        EncodedResourceResolver resolver =
                                                new EncodedResourceResolver();
                                        resolver.setContentCodings(List.of(name));
                                        return new Coding(name, resolver);
                                    })
                            .toList();
        }

        @Override
        public Resource resolveResource(
                HttpServletRequest request,
                String requestPath,
                List<? extends Resource> locations,
                ResourceResolverChain chain) {
            if (request != null) {
                for (Coding coding : this.codings) {
                    if (!accepts(request, coding.name())) {
                        continue;
                    }
                    Resource resolved =
                            coding.resolver()
                                    .resolveResource(request, requestPath, locations, chain);
                    if (isEncodedWith(resolved, coding.name())) {
                        return resolved;
                    }
                }
            }
            return chain.resolveResource(request, requestPath, locations);
        }

        @Override
        public String resolveUrlPath(
                String resourcePath,
                List<? extends Resource> locations,
                ResourceResolverChain chain) {
            return chain.resolveUrlPath(resourcePath, locations);
        }

        private static boolean accepts(HttpServletRequest request, String coding) {
            String header = request.getHeader(HttpHeaders.ACCEPT_ENCODING);
            if (header == null) {
                return false;
            }
            for (String token : header.toLowerCase(Locale.ROOT).split(",")) {
                if (token.split(";", 2)[0].trim().equals(coding)) {
                    return true;
                }
            }
            return false;
        }

        private static boolean isEncodedWith(Resource resource, String coding) {
            return resource instanceof HttpResource httpResource
                    && coding.equals(
                            httpResource
                                    .getResponseHeaders()
                                    .getFirst(HttpHeaders.CONTENT_ENCODING));
        }
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
                            "http://localhost:*",
                            "https://localhost:*",
                            "tauri://*", // Add this for Tauri apps
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
                            "Content-Type",
                            "X-Stirling-Skipped-Field-Edits",
                            "X-Stirling-Skipped-Field-Edits-Total",
                            "X-Stirling-Detected-Fields")
                    .allowCredentials(true)
                    .maxAge(3600);
        } else if (hasConfiguredOrigins) {
            // Use user-configured origins + always include Tauri origins for desktop app support
            logger.info(
                    "Configuring CORS with allowed origins: {}",
                    applicationProperties.getSystem().getCorsAllowedOrigins());

            // Combine user-configured origins with Tauri origins
            List<String> allOrigins =
                    new ArrayList<>(applicationProperties.getSystem().getCorsAllowedOrigins());

            // Always include Tauri origins for desktop app compatibility
            // Tauri v1 uses tauri://localhost, v2 uses http(s)://tauri.localhost
            if (!allOrigins.contains("tauri://localhost")) {
                allOrigins.add("tauri://localhost");
            }
            if (!allOrigins.contains("http://tauri.localhost")) {
                allOrigins.add("http://tauri.localhost");
            }
            if (!allOrigins.contains("https://tauri.localhost")) {
                allOrigins.add("https://tauri.localhost");
            }

            String[] allowedOrigins = allOrigins.toArray(new String[0]);

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
                            "Content-Type",
                            "X-Stirling-Skipped-Field-Edits",
                            "X-Stirling-Skipped-Field-Edits-Total",
                            "X-Stirling-Detected-Fields")
                    .allowCredentials(true)
                    .maxAge(3600);
        } else {
            // Default to allowing all origins when nothing is configured
            logger.debug(
                    "No CORS allowed origins configured in settings.yml"
                            + " (system.corsAllowedOrigins); WebMvcConfig allowing all origins.");
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
                            "Content-Type",
                            "X-Stirling-Skipped-Field-Edits",
                            "X-Stirling-Skipped-Field-Edits-Total",
                            "X-Stirling-Detected-Fields")
                    .allowCredentials(true)
                    .maxAge(3600);
        }
    }
}
