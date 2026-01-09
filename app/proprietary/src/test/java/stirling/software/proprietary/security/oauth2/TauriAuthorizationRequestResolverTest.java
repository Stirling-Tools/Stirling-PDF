package stirling.software.proprietary.security.oauth2;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

class TauriAuthorizationRequestResolverTest {

    private TauriAuthorizationRequestResolver buildResolver() {
        ClientRegistration registration =
                ClientRegistration.withRegistrationId("google")
                        .clientId("client-id")
                        .clientSecret("client-secret")
                        .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                        .authorizationUri("https://accounts.example.com/o/oauth2/auth")
                        .tokenUri("https://accounts.example.com/o/oauth2/token")
                        .redirectUri("http://localhost:8080/login/oauth2/code/google")
                        .userInfoUri("https://accounts.example.com/userinfo")
                        .userNameAttributeName("sub")
                        .clientName("Google")
                        .scope("email")
                        .build();

        return new TauriAuthorizationRequestResolver(
                new InMemoryClientRegistrationRepository(registration));
    }

    private MockHttpServletRequest buildRequest(boolean tauri) {
        MockHttpServletRequest request =
                new MockHttpServletRequest("GET", "/oauth2/authorization/google");
        request.setServletPath("/oauth2/authorization/google");
        if (tauri) {
            request.setParameter("tauri", "1");
        }
        return request;
    }

    @Test
    void resolve_prefixesStateWhenTauriParamPresent() {
        TauriAuthorizationRequestResolver resolver = buildResolver();
        OAuth2AuthorizationRequest authRequest = resolver.resolve(buildRequest(true));
        assertNotNull(authRequest);
        assertNotNull(authRequest.getState());
        assertTrue(authRequest.getState().startsWith("tauri:"));
    }

    @Test
    void resolve_doesNotPrefixStateWithoutTauriParam() {
        TauriAuthorizationRequestResolver resolver = buildResolver();
        OAuth2AuthorizationRequest authRequest = resolver.resolve(buildRequest(false));
        assertNotNull(authRequest);
        assertNotNull(authRequest.getState());
        assertFalse(authRequest.getState().startsWith("tauri:"));
    }
}
