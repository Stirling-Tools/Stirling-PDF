package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class RequestUriUtilsTest {

    // --- isStaticResource tests ---

    @Test
    void testIsStaticResource_nullUri() {
        assertFalse(RequestUriUtils.isStaticResource(null));
    }

    @Test
    void testIsStaticResource_cssDirectory() {
        assertTrue(RequestUriUtils.isStaticResource("/css/style.css"));
    }

    @Test
    void testIsStaticResource_jsDirectory() {
        assertTrue(RequestUriUtils.isStaticResource("/js/app.js"));
    }

    @Test
    void testIsStaticResource_imagesDirectory() {
        assertTrue(RequestUriUtils.isStaticResource("/images/logo.png"));
    }

    @Test
    void testIsStaticResource_robotsTxt() {
        assertTrue(RequestUriUtils.isStaticResource("/robots.txt"));
    }

    @Test
    void testIsStaticResource_faviconIco() {
        assertTrue(RequestUriUtils.isStaticResource("/favicon.ico"));
    }

    @Test
    void testIsStaticResource_loginPath() {
        assertTrue(RequestUriUtils.isStaticResource("/login"));
    }

    @Test
    void testIsStaticResource_errorPath() {
        assertTrue(RequestUriUtils.isStaticResource("/error"));
    }

    @Test
    void testIsStaticResource_svgExtension() {
        assertTrue(RequestUriUtils.isStaticResource("/some/path/icon.svg"));
    }

    @Test
    void testIsStaticResource_apiRoute_notStatic() {
        assertFalse(RequestUriUtils.isStaticResource("/api/v1/convert"));
    }

    @Test
    void testIsStaticResource_apiStatusEndpoint() {
        assertTrue(RequestUriUtils.isStaticResource("/api/v1/info/status"));
    }

    @Test
    void testIsStaticResource_withContextPath() {
        assertTrue(RequestUriUtils.isStaticResource("/app", "/app/css/style.css"));
    }

    @Test
    void testIsStaticResource_mobileScannerPath() {
        assertTrue(RequestUriUtils.isStaticResource("/mobile-scanner"));
    }

    // --- isFrontendRoute tests ---

    @Test
    void testIsFrontendRoute_nullUri() {
        assertFalse(RequestUriUtils.isFrontendRoute("", null));
    }

    @Test
    void testIsFrontendRoute_apiPath() {
        assertFalse(RequestUriUtils.isFrontendRoute("", "/api/v1/convert"));
    }

    @Test
    void testIsFrontendRoute_backendOnlyPath() {
        assertFalse(RequestUriUtils.isFrontendRoute("", "/swagger"));
        assertFalse(RequestUriUtils.isFrontendRoute("", "/register"));
        assertFalse(RequestUriUtils.isFrontendRoute("", "/actuator"));
    }

    @Test
    void testIsFrontendRoute_extensionlessPath() {
        assertTrue(RequestUriUtils.isFrontendRoute("", "/merge"));
        assertTrue(RequestUriUtils.isFrontendRoute("", "/split-pdf"));
    }

    @Test
    void testIsFrontendRoute_pathWithExtension() {
        assertFalse(RequestUriUtils.isFrontendRoute("", "/some/file.pdf"));
    }

    @Test
    void testIsFrontendRoute_blankPath() {
        assertFalse(RequestUriUtils.isFrontendRoute("", ""));
    }

    // --- isTrackableResource tests ---

    @Test
    void testIsTrackableResource_jsPath() {
        assertFalse(RequestUriUtils.isTrackableResource("/js/app.js"));
    }

    @Test
    void testIsTrackableResource_cssFile() {
        assertFalse(RequestUriUtils.isTrackableResource("/some/file.css"));
    }

    @Test
    void testIsTrackableResource_apiPage() {
        assertTrue(RequestUriUtils.isTrackableResource("/api/v1/convert"));
    }

    @Test
    void testIsTrackableResource_swaggerPath() {
        assertFalse(RequestUriUtils.isTrackableResource("/swagger-ui/index.html"));
    }

    @Test
    void testIsTrackableResource_infoApi() {
        assertFalse(RequestUriUtils.isTrackableResource("/api/v1/info/status"));
    }

    // --- isPublicAuthEndpoint tests ---

    @Test
    void testIsPublicAuthEndpoint_loginPath() {
        assertTrue(RequestUriUtils.isPublicAuthEndpoint("/login", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_oauthPath() {
        assertTrue(RequestUriUtils.isPublicAuthEndpoint("/oauth2/authorization/google", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_healthEndpoint() {
        assertTrue(RequestUriUtils.isPublicAuthEndpoint("/actuator/health", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_regularApiNotPublic() {
        assertFalse(RequestUriUtils.isPublicAuthEndpoint("/api/v1/convert", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_withContextPath() {
        assertTrue(RequestUriUtils.isPublicAuthEndpoint("/app/login", "/app"));
    }

    // --- share-link SPA bootstrap ---

    @Test
    void testIsPublicAuthEndpoint_shareLinkToken() {
        assertTrue(
                RequestUriUtils.isPublicAuthEndpoint(
                        "/share/00dcac3a-fc7a-4989-9c4f-97745484d62f", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_shareLinkTokenTrailingSlash() {
        assertTrue(RequestUriUtils.isPublicAuthEndpoint("/share/abc123/", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_shareLinkWithContextPath() {
        assertTrue(RequestUriUtils.isPublicAuthEndpoint("/app/share/abc123", "/app"));
    }

    @Test
    void testIsPublicAuthEndpoint_shareRootNotPublic() {
        // Avoid matching bare "/share" or "/share/" — must have a token segment
        assertFalse(RequestUriUtils.isPublicAuthEndpoint("/share", ""));
        assertFalse(RequestUriUtils.isPublicAuthEndpoint("/share/", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_shareNestedPathNotPublic() {
        // Guard against future additions like /share/<token>/download becoming accidentally public
        assertFalse(RequestUriUtils.isPublicAuthEndpoint("/share/abc123/download", ""));
        assertFalse(RequestUriUtils.isPublicAuthEndpoint("/share/abc/admin", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_shareApiStillProtected() {
        // Share-link data APIs must NOT be public — they enforce auth + access checks
        assertFalse(RequestUriUtils.isPublicAuthEndpoint("/api/v1/storage/share-links/abc123", ""));
        assertFalse(
                RequestUriUtils.isPublicAuthEndpoint(
                        "/api/v1/storage/share-links/abc123/metadata", ""));
    }
}
