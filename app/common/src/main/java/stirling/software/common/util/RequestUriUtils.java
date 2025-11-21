package stirling.software.common.util;

public class RequestUriUtils {

    public static boolean isStaticResource(String requestURI) {
        return isStaticResource("", requestURI);
    }

    public static boolean isStaticResource(String contextPath, String requestURI) {
        return requestURI.startsWith(contextPath + "/css/")
                || requestURI.startsWith(contextPath + "/fonts/")
                || requestURI.startsWith(contextPath + "/js/")
                || requestURI.endsWith(contextPath + "robots.txt")
                || requestURI.startsWith(contextPath + "/images/")
                || requestURI.startsWith(contextPath + "/public/")
                || requestURI.startsWith(contextPath + "/pdfjs/")
                || requestURI.startsWith(contextPath + "/pdfjs-legacy/")
                || requestURI.startsWith(contextPath + "/login")
                || requestURI.startsWith(contextPath + "/error")
                || requestURI.startsWith(contextPath + "/favicon")
                || requestURI.endsWith(".svg")
                || requestURI.endsWith(".png")
                || requestURI.endsWith(".ico")
                || requestURI.endsWith(".txt")
                || requestURI.endsWith(".webmanifest")
                || requestURI.startsWith(contextPath + "/api/v1/info/status");
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
}
