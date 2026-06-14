package stirling.software.proprietary.security.oauth2;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;

class TauriOAuthUtilsTest {

    // Production reads from jakarta.servlet.http.HttpServletRequest (getParameter / getCookies).
    // Spring's MockHttpServletRequest is gone, so we drive the request with a plain Mockito mock
    // and stub only the accessors TauriOAuthUtils actually calls.
    private static HttpServletRequest requestWithState(String state) {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getParameter("state")).thenReturn(state);
        return request;
    }

    private static HttpServletRequest requestWithCookies(Cookie... cookies) {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getCookies()).thenReturn(cookies);
        return request;
    }

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
        HttpServletRequest request = requestWithState("tauri:abc:nonce-123");

        String nonce = TauriOAuthUtils.extractNonceFromRequest(request);
        assertEquals("nonce-123", nonce);
    }

    @Test
    void isTauriState_validTauriState() {
        HttpServletRequest request = requestWithState("tauri:original-state");

        assertTrue(TauriOAuthUtils.isTauriState(request));
    }

    @Test
    void isTauriState_notTauriState() {
        HttpServletRequest request = requestWithState("regular-state");

        assertFalse(TauriOAuthUtils.isTauriState(request));
    }

    @Test
    void isTauriState_noState() {
        HttpServletRequest request = requestWithState(null);

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
        HttpServletRequest request = requestWithCookies((Cookie[]) null);
        assertNull(TauriOAuthUtils.extractRedirectPathFromCookie(request));
    }

    @Test
    void extractRedirectPathFromCookie_withCookie() {
        HttpServletRequest request =
                requestWithCookies(
                        new Cookie(TauriOAuthUtils.SPA_REDIRECT_COOKIE, "/auth/callback"));

        assertEquals("/auth/callback", TauriOAuthUtils.extractRedirectPathFromCookie(request));
    }

    @Test
    void extractRedirectPathFromCookie_emptyCookie() {
        HttpServletRequest request =
                requestWithCookies(new Cookie(TauriOAuthUtils.SPA_REDIRECT_COOKIE, ""));

        assertNull(TauriOAuthUtils.extractRedirectPathFromCookie(request));
    }
}
