package stirling.software.proprietary.security.oauth2;

import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

import jakarta.servlet.http.HttpServletRequest;

public class TauriAuthorizationRequestResolver implements OAuth2AuthorizationRequestResolver {

    private static final String TAURI_STATE_PREFIX = "tauri:";

    private final OAuth2AuthorizationRequestResolver delegate;

    public TauriAuthorizationRequestResolver(
            ClientRegistrationRepository clientRegistrationRepository) {
        this.delegate =
                new DefaultOAuth2AuthorizationRequestResolver(
                        clientRegistrationRepository, "/oauth2/authorization");
    }

    @Override
    public OAuth2AuthorizationRequest resolve(HttpServletRequest request) {
        return customize(request, delegate.resolve(request));
    }

    @Override
    public OAuth2AuthorizationRequest resolve(
            HttpServletRequest request, String clientRegistrationId) {
        return customize(request, delegate.resolve(request, clientRegistrationId));
    }

    private OAuth2AuthorizationRequest customize(
            HttpServletRequest request, OAuth2AuthorizationRequest authorizationRequest) {
        if (authorizationRequest == null) {
            return null;
        }
        String tauriParam = request.getParameter("tauri");
        if (!"1".equals(tauriParam)) {
            return authorizationRequest;
        }

        String state = authorizationRequest.getState();
        if (state == null || state.startsWith(TAURI_STATE_PREFIX)) {
            return authorizationRequest;
        }

        return OAuth2AuthorizationRequest.from(authorizationRequest)
                .state(TAURI_STATE_PREFIX + state)
                .build();
    }
}
