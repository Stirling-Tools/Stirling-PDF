package stirling.software.SPDF.config;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.ext.Provider;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;

/**
 * Migrated from a Spring {@code WebMvcConfigurer} to a JAX-RS {@link ContainerResponseFilter}.
 *
 * <p>This original Spring config performed three distinct jobs that map to different Quarkus
 * mechanisms:
 *
 * <ol>
 *   <li><b>Interceptor registration</b> ({@code addInterceptors}) - the {@code EndpointInterceptor}
 *       is migrated separately to a JAX-RS {@code ContainerRequestFilter}/{@code @Provider}, which
 *       Quarkus discovers and applies automatically. No manual registration is required, so that
 *       method is removed here.
 *   <li><b>Static resource cache control</b> ({@code addResourceHandlers}) - reimplemented below as
 *       a {@link ContainerResponseFilter} that sets the {@code Cache-Control} header per request
 *       path. The static files themselves are served by Quarkus via {@code
 *       quarkus.http.static-resources} / the configured static path (see TODO).
 *   <li><b>CORS</b> ({@code addCorsMappings}) - the dynamic, configuration-driven logic is
 *       preserved below and applied via the same response filter (see TODO about Quarkus built-in
 *       CORS).
 * </ol>
 */
@Provider
@ApplicationScoped
@RequiredArgsConstructor
public class WebMvcConfig implements ContainerResponseFilter {

    private final ApplicationProperties applicationProperties;

    private static final Logger logger = LoggerFactory.getLogger(WebMvcConfig.class);

    // Cache-Control header values (previously Spring CacheControl objects).
    private static final String NO_CACHE = "no-cache";
    private static final String NO_STORE = "no-store";
    private static final String IMMUTABLE_ONE_YEAR =
            "max-age=" + TimeUnit.DAYS.toSeconds(365) + ", public, immutable";
    private static final String ONE_DAY_SWR =
            "max-age="
                    + Duration.ofDays(1).toSeconds()
                    + ", public, stale-while-revalidate="
                    + Duration.ofDays(7).toSeconds();

    // TODO: Migration required - in Spring, addResourceHandlers also registered the physical
    // resource locations (InstallationPathConfig.getStaticPath() + "classpath:/static/") and an
    // EncodedResourceResolver (gzip/brotli pre-compressed asset serving). In Quarkus, static
    // file serving is handled by quarkus.http via configuration:
    //   quarkus.http.static-resources... and/or a Servlet/RouteFilter mapping
    //   InstallationPathConfig.getStaticPath() as an external static root.
    // The EncodedResourceResolver behavior (serving *.gz/*.br variants) has no direct WebMvc
    // equivalent; enable quarkus.http.enable-compression or pre-compressed static handling.
    // This filter only reproduces the per-path Cache-Control headers below.

    @Override
    public void filter(
            ContainerRequestContext requestContext, ContainerResponseContext responseContext)
            throws IOException {
        String path = requestContext.getUriInfo().getPath();
        if (path != null && !path.startsWith("/")) {
            path = "/" + path;
        }

        applyCacheControl(path, responseContext);
        applyCors(requestContext, responseContext);
    }

    /**
     * Reproduces the per-path Cache-Control rules from the original {@code addResourceHandlers}.
     * The resource-handler patterns are matched here in the same priority order.
     */
    private void applyCacheControl(String path, ContainerResponseContext responseContext) {
        if (path == null) {
            return;
        }

        String cacheControl;

        // 1. Service worker and PWA metadata (never store)
        // Browsers revalidate SW bytes anyway; no-store is the safest for atomic updates.
        if (path.equals("/sw.js")
                || path.equals("/manifest.json")
                || path.equals("/site.webmanifest")
                || path.equals("/browserconfig.xml")) {
            cacheControl = NO_STORE;
        }
        // 2. Vite fingerprinted assets (immutable)
        // These already have content hashes in filenames (e.g. index-ChAS4tCC.js)
        else if (path.startsWith("/assets/")) {
            cacheControl = IMMUTABLE_ONE_YEAR;
        }
        // 3. Media and fonts (immutable)
        else if (path.startsWith("/images/") || path.startsWith("/fonts/")) {
            cacheControl = IMMUTABLE_ONE_YEAR;
        }
        // 4. Branding and stable non-fingerprinted assets (1 day + SWR)
        // Use stale-while-revalidate to improve perceived performance.
        else if (isBrandingOrStableAsset(path)) {
            cacheControl = ONE_DAY_SWR;
        }
        // 5. Catch-all (SPA fallback)
        // Must check with server to ensure index.html is always fresh.
        else {
            cacheControl = NO_CACHE;
        }

        responseContext.getHeaders().putSingle(HttpHeaders.CACHE_CONTROL, cacheControl);
    }

    private boolean isBrandingOrStableAsset(String path) {
        return path.startsWith("/favicon.")
                || path.equals("/apple-touch-icon.png")
                || (path.startsWith("/android-chrome-") && path.endsWith(".png"))
                || (path.startsWith("/mstile-") && path.endsWith(".png"))
                || path.equals("/safari-pinned-tab.svg")
                || path.startsWith("/icons/")
                || path.startsWith("/modern-logo/")
                || path.startsWith("/classic-logo/")
                || path.equals("/robots.txt")
                || path.equals("/3rdPartyLicenses.json")
                || path.startsWith("/pdfjs/")
                || path.startsWith("/pdfjs-legacy/")
                || path.startsWith("/pdfium/")
                || path.startsWith("/locales/")
                || path.startsWith("/css/")
                || path.startsWith("/js/")
                || path.startsWith("/vendor/")
                || path.startsWith("/samples/")
                || path.startsWith("/og_images/")
                || path.startsWith("/Login/")
                || path.equals("/manifest-classic.json");
    }

    // TODO: Migration required - Quarkus has built-in CORS handling via quarkus.http.cors.*
    // config properties (quarkus.http.cors.origins, .methods, .headers, .exposed-headers,
    // .access-control-allow-credentials, .access-control-max-age). However, the original logic is
    // *dynamic* (Tauri-mode detection + ApplicationProperties-driven origins + always-on Tauri
    // origins), which static config cannot express. The logic is preserved below and applied via
    // this response filter. Note: a ContainerResponseFilter cannot short-circuit/answer the CORS
    // preflight (OPTIONS) request the way Spring's CorsRegistry does; for full preflight handling,
    // enable quarkus.http.cors=true and reconcile with these dynamic rules, or add a
    // ContainerRequestFilter that handles OPTIONS. Reflecting the requesting Origin is used here
    // since Access-Control-Allow-Origin does not support patterns/wildcards-with-credentials.

    /**
     * Reproduces the dynamic CORS configuration from the original {@code addCorsMappings}: Tauri
     * mode, user-configured origins (always augmented with Tauri origins), or allow-all fallback.
     */
    private void applyCors(
            ContainerRequestContext requestContext, ContainerResponseContext responseContext) {
        String requestOrigin = requestContext.getHeaderString("Origin");

        // Check if running in Tauri mode
        boolean isTauriMode =
                Boolean.parseBoolean(System.getProperty("STIRLING_PDF_TAURI_MODE", "false"));

        // Check if user has configured custom origins
        boolean hasConfiguredOrigins =
                applicationProperties.getSystem() != null
                        && applicationProperties.getSystem().getCorsAllowedOrigins() != null
                        && !applicationProperties.getSystem().getCorsAllowedOrigins().isEmpty();

        String allowedOriginHeader;

        if (isTauriMode) {
            // Automatically enable CORS for Tauri desktop app
            // Tauri v1 uses tauri://localhost, v2 uses http(s)://tauri.localhost
            logger.info("Tauri mode detected - enabling CORS for Tauri protocols (v1 and v2)");
            // Reflect the requesting origin only when it matches the allowed Tauri/localhost
            // patterns (the original allowedOriginPatterns set).
            allowedOriginHeader = matchesTauriPatterns(requestOrigin) ? requestOrigin : null;
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

            // Only reflect the origin if it is in the configured allow-list.
            allowedOriginHeader =
                    (requestOrigin != null && allOrigins.contains(requestOrigin))
                            ? requestOrigin
                            : null;
        } else {
            // Default to allowing all origins when nothing is configured
            logger.debug(
                    "No CORS allowed origins configured in settings.yml"
                            + " (system.corsAllowedOrigins); WebMvcConfig allowing all origins.");
            // allowedOriginPatterns("*") with credentials reflects the requesting origin.
            allowedOriginHeader = requestOrigin;
        }

        if (allowedOriginHeader == null) {
            return;
        }

        var headers = responseContext.getHeaders();
        headers.putSingle("Access-Control-Allow-Origin", allowedOriginHeader);
        headers.putSingle("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
        headers.putSingle(
                "Access-Control-Allow-Headers",
                "Authorization, Content-Type, X-Requested-With, Accept, Origin, X-API-KEY,"
                        + " X-CSRF-TOKEN, X-XSRF-TOKEN, X-Browser-Id");
        headers.putSingle(
                "Access-Control-Expose-Headers",
                "WWW-Authenticate, X-Total-Count, X-Page-Number, X-Page-Size, Content-Disposition,"
                        + " Content-Type");
        headers.putSingle("Access-Control-Allow-Credentials", "true");
        headers.putSingle("Access-Control-Max-Age", "3600");
    }

    private boolean matchesTauriPatterns(String origin) {
        if (origin == null) {
            return false;
        }
        return origin.startsWith("http://localhost:")
                || origin.startsWith("https://localhost:")
                || origin.startsWith("tauri://")
                || origin.equals("tauri://localhost")
                || origin.equals("http://tauri.localhost")
                || origin.equals("https://tauri.localhost");
    }
}
