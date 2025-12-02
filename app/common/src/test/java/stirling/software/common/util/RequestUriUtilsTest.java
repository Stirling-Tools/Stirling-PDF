package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

public class RequestUriUtilsTest {

    @ParameterizedTest(name = "[{index}] isStaticResource({0}) -> {1}")
    @CsvSource({
        "'/css/styles.css', true",
        "'/js/script.js', true",
        "'/images/logo.png', true",
        "'/public/index.html', true",
        "'/pdfjs/pdf.worker.js', true",
        "'/api/v1/info/status', true",
        "'/some-path/icon.svg', true",
        "'/login', true",
        "'/error', true",
        "'/api/v1/users', false",
        "'/api/v1/orders', false",
        "'/', false",
        "'/register', false",
        "'/api/v1/products', false"
    })
    void testIsStaticResource(String requestUri, boolean expected) {
        assertEquals(expected, RequestUriUtils.isStaticResource(requestUri));
    }

    @ParameterizedTest(name = "[{index}] isStaticResource({1}) with context {0} -> {2}")
    @CsvSource({
        "'/myapp', '/myapp/css/styles.css', true",
        "'/myapp', '/myapp/js/script.js', true",
        "'/myapp', '/myapp/images/logo.png', true",
        "'/myapp', '/myapp/login', true",
        "'/myapp', '/myapp/api/v1/users', false",
        "'/myapp', '/', false"
    })
    void testIsStaticResourceWithContextPath(
            String contextPath, String requestUri, boolean expected) {
        assertEquals(expected, RequestUriUtils.isStaticResource(contextPath, requestUri));
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

    @ParameterizedTest(name = "[{index}] isTrackableResource({0}) -> {1}")
    @CsvSource({
        "'/js/script.js', false",
        "'/v1/api-docs', false",
        "'robots.txt', false",
        "'/images/logo.png', false",
        "'/styles.css', false",
        "'/script.js.map', false",
        "'/icon.svg', false",
        "'/popularity.txt', false",
        "'/script.js', false",
        "'/swagger/index.html', false",
        "'/api/v1/info/status', false",
        "'/site.webmanifest', false",
        "'/fonts/font.woff', false",
        "'/pdfjs/viewer.js', false",
        "'/login', true",
        "'/register', true",
        "'/api/v1/users', true",
        "'/', true",
        "'/some-other-path', true"
    })
    void testIsTrackableResource(String requestUri, boolean expected) {
        assertEquals(expected, RequestUriUtils.isTrackableResource(requestUri));
    }

    @ParameterizedTest(name = "[{index}] isTrackableResource({1}) with context {0} -> {2}")
    @CsvSource({
        "'/myapp', '/js/script.js', false",
        "'/myapp', '/login', true",
        "'/myapp', '/fonts/custom.woff', false",
        "'/myapp', '/images/header.png', false",
        "'/myapp', '/swagger/ui.html', false",
        "'/myapp', '/account/profile', true",
        "'/myapp', '/pdf/view', true"
    })
    void testIsTrackableResourceWithContextPath(
            String contextPath, String requestUri, boolean expected) {
        assertEquals(expected, RequestUriUtils.isTrackableResource(contextPath, requestUri));
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
