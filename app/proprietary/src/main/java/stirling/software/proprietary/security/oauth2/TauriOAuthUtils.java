package stirling.software.proprietary.security.oauth2;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;

/**
 * Utility class for Tauri desktop OAuth flow handling. Centralizes common logic for OAuth state
 * management, nonce validation, and callback path construction.
 */
public final class TauriOAuthUtils {

    public static final String TAURI_STATE_PREFIX = "tauri:";
    public static final String SPA_REDIRECT_COOKIE = "stirling_redirect_path";
    public static final String DEFAULT_CALLBACK_PATH = "/auth/callback";
    public static final String TAURI_CALLBACK_SUFFIX = "/tauri";

    private TauriOAuthUtils() {
        // Utility class - prevent instantiation
    }

    /**
     * Extracts nonce from OAuth state parameter for CSRF validation. State format:
     * tauri:<original-state>:<nonce>
     *
     * @param state The state parameter value
     * @return The nonce if present, null otherwise
     */
    public static String extractNonceFromState(String state) {
        if (state == null || !state.startsWith(TAURI_STATE_PREFIX)) {
            return null;
        }
        // Split by ':' and get the last part (nonce)
        String[] parts = state.split(":");
        if (parts.length >= 3) {
            return parts[parts.length - 1];
        }
        return null;
    }

    /**
     * Extracts nonce from request's state parameter.
     *
     * @param request The HTTP request
     * @return The nonce if present, null otherwise
     */
    public static String extractNonceFromRequest(HttpServletRequest request) {
        String state = request.getParameter("state");
        return extractNonceFromState(state);
    }

    /**
     * Checks if the request has a Tauri state parameter (desktop OAuth flow).
     *
     * @param request The HTTP request
     * @return true if this is a Tauri desktop OAuth flow, false otherwise
     */
    public static boolean isTauriState(HttpServletRequest request) {
        String state = request.getParameter("state");
        return state != null && state.startsWith(TAURI_STATE_PREFIX);
    }

    /**
     * Builds the default callback path for the given context path.
     *
     * @param contextPath The application context path
     * @return The full callback path
     */
    public static String defaultCallbackPath(String contextPath) {
        if (contextPath == null
                || contextPath.isBlank()
                || "/".equals(contextPath)
                || "\\".equals(contextPath)) {
            return DEFAULT_CALLBACK_PATH;
        }
        return contextPath + DEFAULT_CALLBACK_PATH;
    }

    /**
     * Builds the Tauri-specific callback path (includes /tauri suffix).
     *
     * @param contextPath The application context path
     * @return The full Tauri callback path
     */
    public static String defaultTauriCallbackPath(String contextPath) {
        return defaultCallbackPath(contextPath) + TAURI_CALLBACK_SUFFIX;
    }

    /**
     * Normalizes context path by removing trailing slashes and handling empty/root paths.
     *
     * @param contextPath The context path to normalize
     * @return Normalized context path (empty string for root)
     */
    public static String normalizeContextPath(String contextPath) {
        if (contextPath == null || contextPath.isBlank() || "/".equals(contextPath)) {
            return "";
        }
        return contextPath;
    }

    /**
     * Finds the SPA redirect cookie value from the request.
     *
     * @param request The HTTP request
     * @return The redirect path from cookie, or null if not found
     */
    public static String extractRedirectPathFromCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (SPA_REDIRECT_COOKIE.equals(cookie.getName())) {
                String value =
                        java.net.URLDecoder.decode(
                                cookie.getValue(), java.nio.charset.StandardCharsets.UTF_8);
                return value.trim().isEmpty() ? null : value.trim();
            }
        }
        return null;
    }
}
