package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/** The guest surface is the security boundary; these tests pin both sides of it. */
class GuestApiPolicyTest {

    @Test
    void documentToolsAreOpenToGuests() {
        assertTrue(GuestApiPolicy.allowsGuest("/api/v1/general/merge-pdfs"));
        assertTrue(GuestApiPolicy.allowsGuest("/api/v1/misc/compress-pdf"));
        assertTrue(GuestApiPolicy.allowsGuest("/api/v1/convert/pdf/img"));
        assertTrue(GuestApiPolicy.allowsGuest("/api/v1/filter/filter-page-count"));
        assertTrue(GuestApiPolicy.allowsGuest("/api/v1/security/add-password"));
        assertTrue(GuestApiPolicy.allowsGuest("/api/v1/form/fields"));
        assertTrue(GuestApiPolicy.allowsGuest("/api/v1/analysis/page-count"));
        assertTrue(GuestApiPolicy.allowsGuest("/api/v1/pipeline/handleData"));
    }

    @Test
    void shellBackgroundCallsAreOpenToGuests() {
        assertTrue(GuestApiPolicy.allowsGuest("/api/v1/config/app-config"));
        assertTrue(GuestApiPolicy.allowsGuest("/api/v1/info/status"));
        assertTrue(GuestApiPolicy.allowsGuest("/api/v1/settings/get"));
        assertTrue(GuestApiPolicy.allowsGuest("/api/v1/ui-data/footer-info"));
        assertTrue(GuestApiPolicy.allowsGuest("/api/v1/proprietary/ui-data/login"));
        assertTrue(GuestApiPolicy.allowsGuest("/api/v1/mobile-scanner/validate-session/abc-123"));
    }

    @Test
    void accountScopedTreesStayShut() {
        assertFalse(GuestApiPolicy.allowsGuest("/api/v1/admin/settings"));
        assertFalse(GuestApiPolicy.allowsGuest("/api/v1/user/me"));
        assertFalse(GuestApiPolicy.allowsGuest("/api/v1/users"));
        assertFalse(GuestApiPolicy.allowsGuest("/api/v1/team/list"));
        assertFalse(GuestApiPolicy.allowsGuest("/api/v1/storage/files"));
        assertFalse(GuestApiPolicy.allowsGuest("/api/v1/audit/logs"));
        assertFalse(GuestApiPolicy.allowsGuest("/api/v1/ai/chat"));
        assertFalse(GuestApiPolicy.allowsGuest("/api/v1/proprietary/signatures/list"));
        assertFalse(GuestApiPolicy.allowsGuest("/api/v1/auth/me"));
        assertFalse(GuestApiPolicy.allowsGuest("/api/v1/auth/mfa/status"));
    }

    @Test
    void shareLinksAndInvitesKeepWorkingThroughTheirTokens() {
        assertTrue(
                GuestApiPolicy.allowsGuest(
                        "/api/v1/storage/share-links/3f2504e0-4f89-11d3-9a0c-0305e82c3301"));
        assertTrue(GuestApiPolicy.allowsGuest("/api/v1/workflow/participant/token"));
        // The rest of those trees is still account territory.
        assertFalse(GuestApiPolicy.allowsGuest("/api/v1/storage/share-links"));
        assertFalse(GuestApiPolicy.allowsGuest("/api/v1/workflow/participant"));
    }

    @Test
    void prefixMatchingIsOnPathSegments() {
        // A tree is opened exactly, not as a loose string prefix.
        assertFalse(GuestApiPolicy.allowsGuest("/api/v1/generally"));
        assertFalse(GuestApiPolicy.allowsGuest("/api/v1/useradmin"));
        assertFalse(GuestApiPolicy.allowsGuest("/api/v1/admin"));
        // The tree root itself is allowed.
        assertTrue(GuestApiPolicy.allowsGuest("/api/v1/general"));
    }

    @Test
    void nonApiAndEmptyPathsAreNeverGuestable() {
        assertFalse(GuestApiPolicy.allowsGuest(null));
        assertFalse(GuestApiPolicy.allowsGuest(""));
        assertFalse(GuestApiPolicy.allowsGuest("/login"));
        assertFalse(GuestApiPolicy.allowsGuest("/api"));
        assertFalse(GuestApiPolicy.allowsGuest("/api/v2/general/merge-pdfs"));
    }
}
