package stirling.software.proprietary.security.saml2;

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
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

@ExtendWith(MockitoExtension.class)
class CustomSaml2AuthenticationSuccessHandlerTest {

    private final ApplicationProperties applicationProperties = new ApplicationProperties();

    private CustomSaml2AuthenticationSuccessHandler handlerWithStubs() {
        LoginAttemptService loginAttemptService = mock(LoginAttemptService.class);
        UserService userService = mock(UserService.class);
        JwtServiceInterface jwtService = mock(JwtServiceInterface.class);
        UserLicenseSettingsService licenseSettingsService = mock(UserLicenseSettingsService.class);

        ApplicationProperties.Security.SAML2 saml2Props =
                new ApplicationProperties.Security.SAML2();
        saml2Props.setAutoCreateUser(true);
        saml2Props.setBlockRegistration(false);

        when(userService.usernameExistsIgnoreCase("user")).thenReturn(false);
        when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.generateToken(
                        org.mockito.Mockito.any(Authentication.class),
                        org.mockito.Mockito.anyMap()))
                .thenReturn("jwt");

        return new CustomSaml2AuthenticationSuccessHandler(
                loginAttemptService,
                saml2Props,
                userService,
                jwtService,
                licenseSettingsService,
                applicationProperties);
    }

    private Authentication authentication() {
        CustomSaml2AuthenticatedPrincipal principal =
                new CustomSaml2AuthenticatedPrincipal(
                        "user", Map.of(), "name-id", List.of(), "response");
        return new TestingAuthenticationToken(principal, "credentials");
    }

    private MockHttpServletRequest request() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        request.setScheme("http");
        request.setServerName("localhost");
        request.setServerPort(8080);
        return request;
    }

    @Test
    void ignoresForwardedHostFromAnotherHost() throws Exception {
        CustomSaml2AuthenticationSuccessHandler handler = handlerWithStubs();
        MockHttpServletRequest request = request();
        request.addHeader("X-Forwarded-Host", "evil.example");
        request.addHeader("X-Forwarded-Proto", "https");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationSuccess(request, response, authentication());

        assertEquals(
                "http://localhost:8080/auth/callback#access_token=jwt",
                response.getRedirectedUrl());
    }

    @Test
    void usesConfiguredFrontendUrlAndIgnoresHeaders() throws Exception {
        CustomSaml2AuthenticationSuccessHandler handler = handlerWithStubs();
        applicationProperties.getSystem().setFrontendUrl("https://app.example.com");
        MockHttpServletRequest request = request();
        request.addHeader("X-Forwarded-Host", "evil.example");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationSuccess(request, response, authentication());

        assertEquals(
                "https://app.example.com/auth/callback#access_token=jwt",
                response.getRedirectedUrl());
    }

    @Test
    void honoursForwardedHeadersWhenHostMatchesRequestHost() throws Exception {
        CustomSaml2AuthenticationSuccessHandler handler = handlerWithStubs();
        MockHttpServletRequest request = request();
        request.addHeader("X-Forwarded-Host", "localhost");
        request.addHeader("X-Forwarded-Proto", "https");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationSuccess(request, response, authentication());

        assertEquals(
                "https://localhost/auth/callback#access_token=jwt", response.getRedirectedUrl());
    }
}
