package stirling.software.proprietary.security.oauth2;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.http.HttpServletRequest;

// TODO: Migration required - this class implemented Spring Security's
// org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver SPI,
// wrapping DefaultOAuth2AuthorizationRequestResolver (built from a
// ClientRegistrationRepository) to inject a custom "tauri:" state value before the
// authorization request is sent to the OAuth2 provider. quarkus-oidc has no equivalent
// pluggable AuthorizationRequestResolver SPI. The Spring glue
// (OAuth2AuthorizationRequestResolver, DefaultOAuth2AuthorizationRequestResolver,
// ClientRegistrationRepository, OAuth2AuthorizationRequest) has been removed.
//
// To re-wire on quarkus-oidc, the Tauri state customization below must be applied during
// the authorization-code redirect. Options:
//   - Use quarkus.oidc.authentication.extra-params / state cookie customization, or
//   - Implement a io.quarkus.oidc.runtime.OidcTenantConfigResolver /
//     io.quarkus.oidc.TenantConfigResolver, or a jakarta.ws.rs.container.ContainerRequestFilter
//     that intercepts the /oauth2/authorization redirect and rewrites the "state" param.
// The state-prefixing/nonce logic in customizeState(...) below is preserved and reusable.
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
