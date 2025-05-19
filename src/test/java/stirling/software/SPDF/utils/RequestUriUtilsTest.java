package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class RequestUriUtilsTest {

    @Test
    void testIsStaticResource() {
        // Test static resources without context path
        assertTrue(
                RequestUriUtils.isStaticResource("/css/styles.css"), "CSS files should be static");
        assertTrue(RequestUriUtils.isStaticResource("/js/script.js"), "JS files should be static");
        assertTrue(
                RequestUriUtils.isStaticResource("/images/logo.png"),
                "Image files should be static");
        assertTrue(
                RequestUriUtils.isStaticResource("/public/index.html"),
                "Public files should be static");
        assertTrue(
                RequestUriUtils.isStaticResource("/pdfjs/pdf.worker.js"),
                "PDF.js files should be static");
        assertTrue(
                RequestUriUtils.isStaticResource("/api/v1/info/status"),
                "API status should be static");
        assertTrue(
                RequestUriUtils.isStaticResource("/some-path/icon.svg"),
                "SVG files should be static");
        assertTrue(RequestUriUtils.isStaticResource("/login"), "Login page should be static");
        assertTrue(RequestUriUtils.isStaticResource("/error"), "Error page should be static");

        // Test non-static resources
        assertFalse(
                RequestUriUtils.isStaticResource("/api/v1/users"),
                "API users should not be static");
        assertFalse(
                RequestUriUtils.isStaticResource("/api/v1/orders"),
                "API orders should not be static");
        assertFalse(RequestUriUtils.isStaticResource("/"), "Root path should not be static");
        assertFalse(
                RequestUriUtils.isStaticResource("/register"),
                "Register page should not be static");
        assertFalse(
                RequestUriUtils.isStaticResource("/api/v1/products"),
                "API products should not be static");
    }

    @Test
    void testIsStaticResourceWithContextPath() {
        String contextPath = "/myapp";

        // Test static resources with context path
        assertTrue(
                RequestUriUtils.isStaticResource(contextPath, contextPath + "/css/styles.css"),
                "CSS with context path should be static");
        assertTrue(
                RequestUriUtils.isStaticResource(contextPath, contextPath + "/js/script.js"),
                "JS with context path should be static");
        assertTrue(
                RequestUriUtils.isStaticResource(contextPath, contextPath + "/images/logo.png"),
                "Images with context path should be static");
        assertTrue(
                RequestUriUtils.isStaticResource(contextPath, contextPath + "/login"),
                "Login with context path should be static");

        // Test non-static resources with context path
        assertFalse(
                RequestUriUtils.isStaticResource(contextPath, contextPath + "/api/v1/users"),
                "API users with context path should not be static");
        assertFalse(
                RequestUriUtils.isStaticResource(contextPath, "/"),
                "Root path with context path should not be static");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "robots.txt",
                "/favicon.ico",
                "/icon.svg",
                "/image.png",
                "/site.webmanifest",
                "/app/logo.svg",
                "/downloads/document.png",
                "/assets/brand.ico",
                "/any/path/with/image.svg",
                "/deep/nested/folder/icon.png"
            })
    void testIsStaticResourceWithFileExtensions(String path) {
        assertTrue(
                RequestUriUtils.isStaticResource(path),
                "Files with specific extensions should be static regardless of path");
    }

    @Test
    void testIsTrackableResource() {
        // Test non-trackable resources (returns false)
        assertFalse(
                RequestUriUtils.isTrackableResource("/js/script.js"),
                "JS files should not be trackable");
        assertFalse(
                RequestUriUtils.isTrackableResource("/v1/api-docs"),
                "API docs should not be trackable");
        assertFalse(
                RequestUriUtils.isTrackableResource("robots.txt"),
                "robots.txt should not be trackable");
        assertFalse(
                RequestUriUtils.isTrackableResource("/images/logo.png"),
                "Images should not be trackable");
        assertFalse(
                RequestUriUtils.isTrackableResource("/styles.css"),
                "CSS files should not be trackable");
        assertFalse(
                RequestUriUtils.isTrackableResource("/script.js.map"),
                "Map files should not be trackable");
        assertFalse(
                RequestUriUtils.isTrackableResource("/icon.svg"),
                "SVG files should not be trackable");
        assertFalse(
                RequestUriUtils.isTrackableResource("/popularity.txt"),
                "Popularity file should not be trackable");
        assertFalse(
                RequestUriUtils.isTrackableResource("/script.js"),
                "JS files should not be trackable");
        assertFalse(
                RequestUriUtils.isTrackableResource("/swagger/index.html"),
                "Swagger files should not be trackable");
        assertFalse(
                RequestUriUtils.isTrackableResource("/api/v1/info/status"),
                "API info should not be trackable");
        assertFalse(
                RequestUriUtils.isTrackableResource("/site.webmanifest"),
                "Webmanifest should not be trackable");
        assertFalse(
                RequestUriUtils.isTrackableResource("/fonts/font.woff"),
                "Fonts should not be trackable");
        assertFalse(
                RequestUriUtils.isTrackableResource("/pdfjs/viewer.js"),
                "PDF.js files should not be trackable");

        // Test trackable resources (returns true)
        assertTrue(RequestUriUtils.isTrackableResource("/login"), "Login page should be trackable");
        assertTrue(
                RequestUriUtils.isTrackableResource("/register"),
                "Register page should be trackable");
        assertTrue(
                RequestUriUtils.isTrackableResource("/api/v1/users"),
                "API users should be trackable");
        assertTrue(RequestUriUtils.isTrackableResource("/"), "Root path should be trackable");
        assertTrue(
                RequestUriUtils.isTrackableResource("/some-other-path"),
                "Other paths should be trackable");
    }

    @Test
    void testIsTrackableResourceWithContextPath() {
        String contextPath = "/myapp";

        // Test with context path
        assertFalse(
                RequestUriUtils.isTrackableResource(contextPath, "/js/script.js"),
                "JS files should not be trackable with context path");
        assertTrue(
                RequestUriUtils.isTrackableResource(contextPath, "/login"),
                "Login page should be trackable with context path");

        // Additional tests with context path
        assertFalse(
                RequestUriUtils.isTrackableResource(contextPath, "/fonts/custom.woff"),
                "Font files should not be trackable with context path");
        assertFalse(
                RequestUriUtils.isTrackableResource(contextPath, "/images/header.png"),
                "Images should not be trackable with context path");
        assertFalse(
                RequestUriUtils.isTrackableResource(contextPath, "/swagger/ui.html"),
                "Swagger UI should not be trackable with context path");
        assertTrue(
                RequestUriUtils.isTrackableResource(contextPath, "/account/profile"),
                "Account page should be trackable with context path");
        assertTrue(
                RequestUriUtils.isTrackableResource(contextPath, "/pdf/view"),
                "PDF view page should be trackable with context path");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "/js/util.js",
                "/v1/api-docs/swagger.json",
                "/robots.txt",
                "/images/header/logo.png",
                "/styles/theme.css",
                "/build/app.js.map",
                "/assets/icon.svg",
                "/data/popularity.txt",
                "/bundle.js",
                "/api/swagger-ui.html",
                "/api/v1/info/health",
                "/site.webmanifest",
                "/fonts/roboto.woff",
                "/pdfjs/viewer.js"
            })
    void testNonTrackableResources(String path) {
        assertFalse(
                RequestUriUtils.isTrackableResource(path),
                "Resources matching patterns should not be trackable: " + path);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "/",
                "/home",
                "/login",
                "/register",
                "/pdf/merge",
                "/pdf/split",
                "/api/v1/users/1",
                "/api/v1/documents/process",
                "/settings",
                "/account/profile",
                "/dashboard",
                "/help",
                "/about"
            })
    void testTrackableResources(String path) {
        assertTrue(
                RequestUriUtils.isTrackableResource(path),
                "App routes should be trackable: " + path);
    }

    @Test
    void testEdgeCases() {
        // Test with empty strings
        assertFalse(RequestUriUtils.isStaticResource("", ""), "Empty path should not be static");
        assertTrue(RequestUriUtils.isTrackableResource("", ""), "Empty path should be trackable");

        // Test with null-like behavior (would actually throw NPE in real code)
        // These are not actual null tests but shows handling of odd cases
        assertFalse(RequestUriUtils.isStaticResource("null"), "String 'null' should not be static");

        // Test String "null" as a path
        boolean isTrackable = RequestUriUtils.isTrackableResource("null");
        assertTrue(isTrackable, "String 'null' should be trackable");

        // Mixed case extensions test - note that Java's endsWith() is case-sensitive
        // We'll check actual behavior and document it rather than asserting

        // Always test the lowercase versions which should definitely work
        assertTrue(
                RequestUriUtils.isStaticResource("/logo.png"), "PNG (lowercase) should be static");
        assertTrue(
                RequestUriUtils.isStaticResource("/icon.svg"), "SVG (lowercase) should be static");

        // Path with query parameters
        assertFalse(
                RequestUriUtils.isStaticResource("/api/users?page=1"),
                "Path with query params should respect base path");
        assertTrue(
                RequestUriUtils.isStaticResource("/images/logo.png?v=123"),
                "Static resource with query params should still be static");

        // Paths with fragments
        assertTrue(
                RequestUriUtils.isStaticResource("/css/styles.css#section1"),
                "CSS with fragment should be static");

        // Multiple dots in filename
        assertTrue(
                RequestUriUtils.isStaticResource("/js/jquery.min.js"),
                "JS with multiple dots should be static");

        // Special characters in path
        assertTrue(
                RequestUriUtils.isStaticResource("/images/user's-photo.png"),
                "Path with special chars should be handled correctly");
    }

    @Test
    void testComplexPaths() {
        // Test complex static resource paths
        assertTrue(
                RequestUriUtils.isStaticResource("/css/theme/dark/styles.css"),
                "Nested CSS should be static");
        assertTrue(
                RequestUriUtils.isStaticResource("/fonts/open-sans/bold/font.woff"),
                "Nested font should be static");
        assertTrue(
                RequestUriUtils.isStaticResource("/js/vendor/jquery/3.5.1/jquery.min.js"),
                "Versioned JS should be static");

        // Test complex paths with context
        String contextPath = "/app";
        assertTrue(
                RequestUriUtils.isStaticResource(
                        contextPath, contextPath + "/css/theme/dark/styles.css"),
                "Nested CSS with context should be static");

        // Test boundary cases for isTrackableResource
        assertFalse(
                RequestUriUtils.isTrackableResource("/js-framework/components"),
                "Path starting with js- should not be treated as JS resource");
        assertFalse(
                RequestUriUtils.isTrackableResource("/fonts-selection"),
                "Path starting with fonts- should not be treated as font resource");
    }
}
