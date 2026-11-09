package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.Collections;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.oidc.IdTokenClaimNames;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.User;

@ExtendWith(MockitoExtension.class)
class CustomOAuth2UserServiceTest {

    @Mock private UserService userService;
    @Mock private LoginAttemptService loginAttemptService;
    @Mock private OidcUserRequest userRequest;

    @Test
    void localPasswordAccountIsLeftToTheSuccessHandler() throws Exception {
        ApplicationProperties.Security.OAUTH2 props = new ApplicationProperties.Security.OAUTH2();
        props.setEnabled(true);
        props.setUseAsUsername("email");
        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService);
        OidcIdToken idToken =
                new OidcIdToken(
                        "raw-token",
                        Instant.now(),
                        Instant.now().plusSeconds(300),
                        Map.of(
                                IdTokenClaimNames.SUB,
                                "provider-sub",
                                IdTokenClaimNames.ISS,
                                "https://idp.example.com",
                                "email",
                                "jane@example.com"));
        stubDelegate(service, idToken);
        when(userRequest.getClientRegistration()).thenReturn(registration());
        when(userRequest.getIdToken()).thenReturn(idToken);
        User local = new User();
        local.setUsername("jane@example.com");
        local.setPassword("hash");
        when(userService.findByUsernameIgnoreCase("jane@example.com"))
                .thenReturn(Optional.of(local));
        when(loginAttemptService.isBlocked("jane@example.com")).thenReturn(false);

        OidcUser user = service.loadUser(userRequest);

        assertThat(user.getName()).isEqualTo("jane@example.com");
        verify(userService, never()).hasPassword(anyString());
    }

    private static ClientRegistration registration() {
        return ClientRegistration.withRegistrationId("keycloak")
                .clientId("client-id")
                .clientSecret("client-secret")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("https://app.example.com/login/oauth2/code/keycloak")
                .authorizationUri("https://idp.example.com/authorize")
                .tokenUri("https://idp.example.com/token")
                .jwkSetUri("https://idp.example.com/keys")
                .build();
    }

    private static void stubDelegate(CustomOAuth2UserService service, OidcIdToken idToken)
            throws Exception {
        OidcUserService delegate = mock(OidcUserService.class);
        when(delegate.loadUser(any()))
                .thenReturn(
                        new DefaultOidcUser(
                                Collections.emptyList(), idToken, IdTokenClaimNames.SUB));
        Field field = CustomOAuth2UserService.class.getDeclaredField("delegate");
        field.setAccessible(true);
        field.set(service, delegate);
    }
}
