package stirling.software.proprietary.security.saml2;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Utility helpers for the Tauri desktop SAML flow.
 */
public final class TauriSamlUtils {

    public static final String TAURI_RELAY_STATE_PREFIX = "tauri:";

    private TauriSamlUtils() {
        // Utility class - prevent instantiation
    }

    public static boolean isTauriRelayState(HttpServletRequest request) {
        String relayState = request.getParameter("RelayState");
        return relayState != null
                && (relayState.equals("tauri") || relayState.startsWith(TAURI_RELAY_STATE_PREFIX));
    }

    public static String extractNonceFromRelayState(String relayState) {
        if (relayState == null || !relayState.startsWith(TAURI_RELAY_STATE_PREFIX)) {
            return null;
        }
        String[] parts = relayState.split(":");
        if (parts.length >= 2) {
            String nonce = parts[parts.length - 1];
            return nonce.isBlank() ? null : nonce;
        }
        return null;
    }

    public static String extractNonceFromRequest(HttpServletRequest request) {
        return extractNonceFromRelayState(request.getParameter("RelayState"));
    }

    public static String buildRelayState(String nonce) {
        if (nonce == null || nonce.isBlank()) {
            return "tauri";
        }
        return TAURI_RELAY_STATE_PREFIX + nonce;
    }
}
