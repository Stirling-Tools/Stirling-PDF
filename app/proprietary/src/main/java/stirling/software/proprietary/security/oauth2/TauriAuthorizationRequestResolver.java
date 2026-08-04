package stirling.software.proprietary.security.oauth2;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.http.HttpServletRequest;

@ApplicationScoped
public class TauriAuthorizationRequestResolver {

    private static final String TAURI_STATE_PREFIX = "tauri:";

    /**
     * Preserved Tauri state-customization logic. Given the original OAuth2 "state" value and the
     * incoming request, returns the state value that should be used for the authorization request.
     *
     * <p>When the request carries {@code tauri=1}, the state is prefixed with {@code "tauri:"} (and
     * the optional {@code nonce} request parameter appended for CSRF protection), unless it has
     * already been customized. Otherwise the original state is returned unchanged.
     */
    public String customizeState(HttpServletRequest request, String state) {
        if (request == null) {
            return state;
        }
        String tauriParam = request.getParameter("tauri");
        if (!"1".equals(tauriParam)) {
            return state;
        }

        if (state == null || state.startsWith(TAURI_STATE_PREFIX)) {
            return state;
        }

        // Extract nonce from request for CSRF protection
        String nonce = request.getParameter("nonce");
        String customState = TAURI_STATE_PREFIX + state;
        if (nonce != null && !nonce.isBlank()) {
            customState = customState + ":" + nonce;
        }

        return customState;
    }
}
