package stirling.software.common.util;

public class RequestUriUtils {

    public static boolean isStaticResource(String requestURI) {
        return isStaticResource("", requestURI);
    }

    public static boolean isStaticResource(String contextPath, String requestURI) {
        if (requestURI == null) {
            return false;
        }

        String normalizedUri = stripContextPath(contextPath, requestURI);

        // API routes are never static except for the public status endpoint
        if (normalizedUri.startsWith("/api/")) {
            return normalizedUri.startsWith("/api/v1/info/status");
        }

        // Well-known static asset directories (backend + React build artifacts)
        if (normalizedUri.startsWith("/css/")
                || normalizedUri.startsWith("/fonts/")
                || normalizedUri.startsWith("/js/")
                || normalizedUri.startsWith("/images/")
                || normalizedUri.startsWith("/public/")
                || normalizedUri.startsWith("/pdfjs/")
                || normalizedUri.startsWith("/pdfjs-legacy/")
                || normalizedUri.startsWith("/assets/")
                || normalizedUri.startsWith("/locales/")
                || normalizedUri.startsWith("/Login/")
                || normalizedUri.startsWith("/samples/")
                || normalizedUri.startsWith("/classic-logo/")
                || normalizedUri.startsWith("/modern-logo/")
                || normalizedUri.startsWith("/og_images/")) {
            return true;
        }

        // Specific static files bundled with the frontend
        if (normalizedUri.equals("/robots.txt")
                || normalizedUri.equals("/favicon.ico")
                || normalizedUri.equals("/site.webmanifest")
                || normalizedUri.equals("/manifest-classic.json")
                || normalizedUri.equals("/index.html")) {
            return true;
        }

        // Login/error pages remain public
        if (normalizedUri.startsWith("/login") || normalizedUri.startsWith("/error")) {
            return true;
        }

        // Treat common static file extensions as static resources
        return normalizedUri.endsWith(".svg")
                || normalizedUri.endsWith(".png")
                || normalizedUri.endsWith(".ico")
                || normalizedUri.endsWith(".txt")
                || normalizedUri.endsWith(".webmanifest")
                || normalizedUri.endsWith(".js")
                || normalizedUri.endsWith(".css")
                || normalizedUri.endsWith(".mjs")
                || normalizedUri.endsWith(".html");
    }

    public static boolean isFrontendRoute(String contextPath, String requestURI) {
        if (requestURI == null) {
            return false;
        }

        String normalizedUri = stripContextPath(contextPath, requestURI);

        // APIs are never treated as frontend routes
        if (normalizedUri.startsWith("/api/")) {
            return false;
        }

        // Blocklist of backend/non-frontend paths that should still go through filters
        String[] backendOnlyPrefixes = {
            "/register",
            "/invite",
            "/pipeline",
            "/pdfjs",
            "/pdfjs-legacy",
            "/fonts",
            "/images",
            "/files",
            "/css",
            "/js",
            "/swagger",
            "/v1/api-docs",
            "/actuator"
        };

        for (String prefix : backendOnlyPrefixes) {
            if (normalizedUri.equals(prefix) || normalizedUri.startsWith(prefix + "/")) {
                return false;
            }
        }

        if (normalizedUri.isBlank()) {
            return false;
        }

        // Allow root and any extensionless path (React Router will handle these)
        return !normalizedUri.contains(".");
    }

    public static boolean isTrackableResource(String requestURI) {
        return isTrackableResource("", requestURI);
    }

    public static boolean isTrackableResource(String contextPath, String requestURI) {
        return !(requestURI.startsWith("/js")
                || requestURI.startsWith("/v1/api-docs")
                || requestURI.endsWith("robots.txt")
                || requestURI.startsWith("/images")
                || requestURI.endsWith(".png")
                || requestURI.endsWith(".ico")
                || requestURI.endsWith(".css")
                || requestURI.endsWith(".txt")
                || requestURI.endsWith(".map")
                || requestURI.endsWith(".svg")
                || requestURI.endsWith("popularity.txt")
                || requestURI.endsWith(".js")
                || requestURI.contains("swagger")
                || requestURI.startsWith("/api/v1/info")
                || requestURI.startsWith("/site.webmanifest")
                || requestURI.startsWith("/fonts")
                || requestURI.startsWith("/pdfjs"));
    }

    /**
     * Checks if the request URI is a public authentication endpoint that doesn't require
     * authentication. This includes login, signup, OAuth callbacks, and public config endpoints.
     *
     * @param requestURI The full request URI
     * @param contextPath The servlet context path
     * @return true if the endpoint is public and doesn't require authentication
     */
    public static boolean isPublicAuthEndpoint(String requestURI, String contextPath) {
        // Remove context path from URI to normalize path matching
        String trimmedUri =
                requestURI.startsWith(contextPath)
                        ? requestURI.substring(contextPath.length())
                        : requestURI;

        // Public auth endpoints that don't require authentication
        return trimmedUri.startsWith("/login")
                || trimmedUri.startsWith("/auth/")
                || trimmedUri.startsWith("/oauth2")
                || trimmedUri.startsWith("/saml2")
                || trimmedUri.contains("/login/oauth2/code/") // Spring Security OAuth2 callback
                || trimmedUri.contains("/oauth2/authorization/") // OAuth2 authorization endpoint
                || trimmedUri.startsWith("/api/v1/auth/login")
                || trimmedUri.startsWith("/api/v1/auth/refresh")
                || trimmedUri.startsWith("/api/v1/auth/logout")
                || trimmedUri.startsWith(
                        "/api/v1/proprietary/ui-data/login") // Login page config (SSO providers +
                // enableLogin)
                || trimmedUri.startsWith("/v1/api-docs")
                || trimmedUri.startsWith("/api/v1/invite/validate")
                || trimmedUri.startsWith("/api/v1/invite/accept")
                || trimmedUri.contains("/v1/api-docs");
    }

    private static String stripContextPath(String contextPath, String requestURI) {
        if (contextPath != null && !contextPath.isBlank() && requestURI.startsWith(contextPath)) {
            return requestURI.substring(contextPath.length());
        }
        return requestURI;
    }
}
