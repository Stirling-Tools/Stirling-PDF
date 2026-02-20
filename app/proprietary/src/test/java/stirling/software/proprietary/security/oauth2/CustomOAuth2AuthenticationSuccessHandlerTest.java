package stirling.software.proprietary.security.oauth2;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

@ExtendWith(MockitoExtension.class)
class CustomOAuth2AuthenticationSuccessHandlerTest {

    @Test
    void redirectsToTauriCallbackWhenStateMarked() throws Exception {
        LoginAttemptService loginAttemptService = mock(LoginAttemptService.class);
        UserService userService = mock(UserService.class);
        JwtServiceInterface jwtService = mock(JwtServiceInterface.class);
        UserLicenseSettingsService licenseSettingsService = mock(UserLicenseSettingsService.class);

        ApplicationProperties.Security.OAUTH2 oauth2Props =
                new ApplicationProperties.Security.OAUTH2();
        oauth2Props.setAutoCreateUser(true);
        oauth2Props.setBlockRegistration(false);

        ApplicationProperties applicationProperties = new ApplicationProperties();
        ApplicationProperties.Security securityProperties = new ApplicationProperties.Security();
        securityProperties.setOauth2(oauth2Props);
        applicationProperties.setSecurity(securityProperties);

        CustomOAuth2AuthenticationSuccessHandler handler =
                new CustomOAuth2AuthenticationSuccessHandler(
                        loginAttemptService,
                        oauth2Props,
                        userService,
                        jwtService,
                        licenseSettingsService,
                        applicationProperties);

        when(userService.usernameExistsIgnoreCase("user")).thenReturn(false);
        when(licenseSettingsService.isOAuthEligible(null)).thenReturn(true);
        when(userService.isUserDisabled("user")).thenReturn(false);
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.generateToken(
                        org.mockito.Mockito.any(
                                org.springframework.security.core.Authentication.class),
                        org.mockito.Mockito.anyMap()))
                .thenReturn("jwt");

        Map<String, Object> attributes = Map.of("sub", "provider-sub", "name", "user");
        DefaultOAuth2User oauthUser =
                new DefaultOAuth2User(
                        List.of(new SimpleGrantedAuthority("ROLE_USER")), attributes, "name");
        OAuth2AuthenticationToken authentication =
                new OAuth2AuthenticationToken(oauthUser, oauthUser.getAuthorities(), "google");

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        request.setScheme("http");
        request.setServerName("localhost");
        request.setServerPort(8080);
        request.setParameter("state", "tauri:abc");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationSuccess(request, response, authentication);

        assertEquals(
                "http://localhost:8080/auth/callback/tauri#access_token=jwt",
                response.getRedirectedUrl());
    }
}
