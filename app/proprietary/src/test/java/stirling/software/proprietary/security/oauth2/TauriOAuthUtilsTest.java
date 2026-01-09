package stirling.software.proprietary.security.oauth2;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class TauriOAuthUtilsTest {

    @Test
    void extractNonceFromState_validState() {
        String state = "tauri:original-state-12345:test-nonce-uuid";
        String nonce = TauriOAuthUtils.extractNonceFromState(state);
        assertEquals("test-nonce-uuid", nonce);
    }

    @Test
    void extractNonceFromState_stateWithColonInNonce() {
        String state = "tauri:original:complex:nonce-with-colon";
        String nonce = TauriOAuthUtils.extractNonceFromState(state);
        assertEquals("nonce-with-colon", nonce);
    }

    @Test
    void extractNonceFromState_noNonce() {
        String state = "tauri:original-state";
        String nonce = TauriOAuthUtils.extractNonceFromState(state);
        assertNull(nonce);
    }

    @Test
    void extractNonceFromState_notTauriState() {
        String state = "regular-state:with-colons";
        String nonce = TauriOAuthUtils.extractNonceFromState(state);
        assertNull(nonce);
    }

    @Test
    void extractNonceFromState_nullState() {
        String nonce = TauriOAuthUtils.extractNonceFromState(null);
        assertNull(nonce);
    }

    @Test
    void extractNonceFromRequest_validRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("state", "tauri:abc:nonce-123");

        String nonce = TauriOAuthUtils.extractNonceFromRequest(request);
        assertEquals("nonce-123", nonce);
    }

    @Test
    void isTauriState_validTauriState() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("state", "tauri:original-state");

        assertTrue(TauriOAuthUtils.isTauriState(request));
    }

    @Test
    void isTauriState_notTauriState() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("state", "regular-state");

        assertFalse(TauriOAuthUtils.isTauriState(request));
    }

    @Test
    void isTauriState_noState() {
        MockHttpServletRequest request = new MockHttpServletRequest();

        assertFalse(TauriOAuthUtils.isTauriState(request));
    }

    @Test
    void defaultCallbackPath_rootContext() {
        assertEquals("/auth/callback", TauriOAuthUtils.defaultCallbackPath("/"));
        assertEquals("/auth/callback", TauriOAuthUtils.defaultCallbackPath(""));
        assertEquals("/auth/callback", TauriOAuthUtils.defaultCallbackPath(null));
    }

    @Test
    void defaultCallbackPath_withContext() {
        assertEquals("/myapp/auth/callback", TauriOAuthUtils.defaultCallbackPath("/myapp"));
    }

    @Test
    void defaultTauriCallbackPath_rootContext() {
        assertEquals("/auth/callback/tauri", TauriOAuthUtils.defaultTauriCallbackPath("/"));
    }

    @Test
    void defaultTauriCallbackPath_withContext() {
        assertEquals(
                "/myapp/auth/callback/tauri", TauriOAuthUtils.defaultTauriCallbackPath("/myapp"));
    }

    @Test
    void normalizeContextPath_rootPaths() {
        assertEquals("", TauriOAuthUtils.normalizeContextPath("/"));
        assertEquals("", TauriOAuthUtils.normalizeContextPath(""));
        assertEquals("", TauriOAuthUtils.normalizeContextPath(null));
    }

    @Test
    void normalizeContextPath_withPath() {
        assertEquals("/myapp", TauriOAuthUtils.normalizeContextPath("/myapp"));
    }

    @Test
    void extractRedirectPathFromCookie_noCookies() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        assertNull(TauriOAuthUtils.extractRedirectPathFromCookie(request));
    }

    @Test
    void extractRedirectPathFromCookie_withCookie() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(
                new jakarta.servlet.http.Cookie(
                        TauriOAuthUtils.SPA_REDIRECT_COOKIE, "/auth/callback"));

        assertEquals("/auth/callback", TauriOAuthUtils.extractRedirectPathFromCookie(request));
    }

    @Test
    void extractRedirectPathFromCookie_emptyCookie() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(
                new jakarta.servlet.http.Cookie(TauriOAuthUtils.SPA_REDIRECT_COOKIE, ""));

        assertNull(TauriOAuthUtils.extractRedirectPathFromCookie(request));
    }
}
