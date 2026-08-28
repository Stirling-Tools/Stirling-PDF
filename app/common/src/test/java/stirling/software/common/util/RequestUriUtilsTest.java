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

    @Test
    void testIsStaticResource_mobileSignPath() {
        // The phone-side signature drawing page, reached from the Sign tool QR code.
        assertTrue(RequestUriUtils.isStaticResource("/mobile-sign"));
        assertTrue(RequestUriUtils.isStaticResource("/app", "/app/mobile-sign"));
    }

    @Test
    void testIsStaticResource_portalShell() {
        // The admin portal SPA shell (/processor) is served pre-auth so it's directly navigable.
        assertTrue(RequestUriUtils.isStaticResource("/processor"));
        assertTrue(RequestUriUtils.isStaticResource("/processor/users"));
        assertTrue(RequestUriUtils.isStaticResource("/app", "/app/processor"));
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
    void testIsFrontendRoute_editorRouteOwnedByFrontend() {
        // /editor (and its tool routes) is an SPA route: a direct-nav/refresh must
        // serve index.html, not the auth filter's 302-to-/login. Regression test for
        // the editor moving from / to /editor, whose refresh bounced processor users
        // to the processor because the redirect dropped the return path.
        assertTrue(RequestUriUtils.isFrontendRoute("", "/editor"));
        assertTrue(RequestUriUtils.isFrontendRoute("/app", "/app/editor"));
    }

    @Test
    void testIsFrontendRoute_filesRouteOwnedByFrontend() {
        // /files and /files/<folder-uuid> are FileManagerView routes - they
        // must fall through to the SPA index.html, not get blocked by the
        // backend auth filter. Regression test for direct-nav/refresh on
        // the file manager returning a 401 JSON.
        assertTrue(RequestUriUtils.isFrontendRoute("", "/files"));
        assertTrue(
                RequestUriUtils.isFrontendRoute("", "/files/3331910a-4155-4f71-8111-e38c896bc458"));
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
    void testIsPublicAuthEndpoint_webhookReceiver() {
        // The webhook source receiver authenticates each delivery by HMAC signature, not a session.
        assertTrue(RequestUriUtils.isPublicAuthEndpoint("/api/v1/webhooks/whk_abc123", ""));
        assertTrue(RequestUriUtils.isPublicAuthEndpoint("/app/api/v1/webhooks/whk_abc123", "/app"));
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
        assertTrue(
                RequestUriUtils.isPublicAuthEndpoint(
                        "/share/00dcac3a-fc7a-4989-9c4f-97745484d62f/", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_shareLinkWithContextPath() {
        assertTrue(
                RequestUriUtils.isPublicAuthEndpoint(
                        "/app/share/00dcac3a-fc7a-4989-9c4f-97745484d62f", "/app"));
    }

    @Test
    void testIsPublicAuthEndpoint_shareLinkWithInvalidTokenLength() {
        assertFalse(RequestUriUtils.isPublicAuthEndpoint("/share/abc123", ""));
        assertFalse(
                RequestUriUtils.isPublicAuthEndpoint(
                        "/share/00dcac3a-fc7a-4989-9c4f-97745484d62fa", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_shareRootNotPublic() {
        // Avoid matching bare "/share" or "/share/" - must have a token segment
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
        // Share-link data APIs must NOT be public - they enforce auth + access checks
        assertFalse(RequestUriUtils.isPublicAuthEndpoint("/api/v1/storage/share-links/abc123", ""));
        assertFalse(
                RequestUriUtils.isPublicAuthEndpoint(
                        "/api/v1/storage/share-links/abc123/metadata", ""));
    }

    // --- invite-accept SPA bootstrap ---

    private static final String INVITE_TOKEN = "06a20e7e-2e35-4e26-be7d-2dce14f28f12";

    @Test
    void testIsPublicAuthEndpoint_inviteLinkToken() {
        assertTrue(RequestUriUtils.isPublicAuthEndpoint("/invite/" + INVITE_TOKEN, ""));
    }

    @Test
    void testIsPublicAuthEndpoint_inviteLinkTokenTrailingSlash() {
        assertTrue(RequestUriUtils.isPublicAuthEndpoint("/invite/" + INVITE_TOKEN + "/", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_inviteLinkWithContextPath() {
        assertTrue(RequestUriUtils.isPublicAuthEndpoint("/app/invite/" + INVITE_TOKEN, "/app"));
    }

    @Test
    void testIsPublicAuthEndpoint_inviteRootNotPublic() {
        // Avoid matching bare "/invite" or "/invite/" - must have a token segment
        assertFalse(RequestUriUtils.isPublicAuthEndpoint("/invite", ""));
        assertFalse(RequestUriUtils.isPublicAuthEndpoint("/invite/", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_inviteNestedPathNotPublic() {
        // Guard against future additions like /invite/<token>/foo becoming accidentally public
        assertFalse(RequestUriUtils.isPublicAuthEndpoint("/invite/" + INVITE_TOKEN + "/foo", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_invitePrefixDoesNotOvermatch() {
        // "/inviteX" must not match the invite pattern
        assertFalse(RequestUriUtils.isPublicAuthEndpoint("/inviteX", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_inviteNonUuidTokenNotPublic() {
        // Only exactly-shaped 36-char lowercase UUID tokens are treated as invite links
        assertFalse(RequestUriUtils.isPublicAuthEndpoint("/invite/abc123", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_inviteUppercaseUuidNotPublic() {
        // Tokens are generated lowercase by UUID.randomUUID().toString()
        assertFalse(
                RequestUriUtils.isPublicAuthEndpoint(
                        "/invite/06A20E7E-2E35-4E26-BE7D-2DCE14F28F12", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_inviteWrongLengthNotPublic() {
        // 35-char and 37-char UUID-like tokens are not valid UUIDs
        assertFalse(
                RequestUriUtils.isPublicAuthEndpoint(
                        "/invite/06a20e7e-2e35-4e26-be7d-2dce14f28f1", ""));
        assertFalse(
                RequestUriUtils.isPublicAuthEndpoint(
                        "/invite/06a20e7e-2e35-4e26-be7d-2dce14f28f122", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_inviteWrongGroupingNotPublic() {
        // Groups of 8-4-4-4-4 must not be shifted around (e.g. 4-4-4-4-8)
        assertFalse(
                RequestUriUtils.isPublicAuthEndpoint(
                        "/invite/06a2-0e7e-2e35-4e26-be7d2dce14f28f12", ""));
    }

    @Test
    void testIsPublicAuthEndpoint_inviteTokenInvalidCharsNotPublic() {
        // Hex-only; anything outside [0-9a-f] or the UUID hyphens is rejected
        assertFalse(RequestUriUtils.isPublicAuthEndpoint("/invite/abc$123", ""));
        assertFalse(RequestUriUtils.isPublicAuthEndpoint("/invite/abc..123", ""));
        assertFalse(RequestUriUtils.isPublicAuthEndpoint("/invite/abc%2F123", ""));
        assertFalse(
                RequestUriUtils.isPublicAuthEndpoint(
                        "/invite/06a20e7e-2e35-4e26-be7d-2dce14f28f1g", ""));
    }
}
