package stirling.software.proprietary.security.saml2;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;

import jakarta.servlet.http.Cookie;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

class SamlRedirectTest {
    @ParameterizedTest
    @ValueSource(
            strings = {
                "//attacker.example/callback",
                "/\\attacker.example/callback",
                "/%2f%2fattacker.example/callback",
                "/auth/callback#redirect",
                "/%0d%0aLocation:evil",
                "%"
            })
    void untrustedHeadersAndCookiesCannotReceiveTheToken(String path) throws Exception {
        assertThat(login(null, path, false)).isEqualTo("/auth/callback#access_token=test-token");
    }

    @Test
    void configuredFrontendAndLocalCallbackRemainSupported() throws Exception {
        assertThat(login("https://app.example", "/app/auth/callback", false))
                .isEqualTo("https://app.example/app/auth/callback#access_token=test-token");
        assertThat(login(null, "/app/auth/callback", false))
                .isEqualTo("/app/auth/callback#access_token=test-token");
    }

    @Test
    void deniedUsersStayOnTheApplicationOrigin() throws Exception {
        assertThat(login(null, "//attacker.example", true))
                .isEqualTo("/logout?saml2RequiresLicense=true");
    }

    private String login(String frontend, String path, boolean denied) throws Exception {
        var properties = new ApplicationProperties();
        properties.getSystem().setFrontendUrl(frontend);
        var eligibility = mock(UserLicenseSettingsService.class);
        when(eligibility.isSamlEligible(any())).thenReturn(!denied);
        var jwt = mock(JwtServiceInterface.class);
        when(jwt.isJwtEnabled()).thenReturn(true);
        when(jwt.generateToken(any(Authentication.class), anyMap())).thenReturn("test-token");
        var users = mock(UserService.class);
        when(users.usernameExistsIgnoreCase("verified-user")).thenReturn(true);
        var handler =
                new CustomSaml2AuthenticationSuccessHandler(
                        mock(LoginAttemptService.class),
                        properties.getSecurity().getSaml2(),
                        users,
                        jwt,
                        eligibility,
                        properties);
        var principal =
                new CustomSaml2AuthenticatedPrincipal(
                        "verified-user", Map.of(), "name", List.of(), "signed-response");
        var authentication =
                UsernamePasswordAuthenticationToken.authenticated(principal, null, List.of());
        var request = new MockHttpServletRequest();
        request.addHeader("Referer", "https://attacker.example/");
        request.addHeader("X-Forwarded-Host", "attacker.example");
        request.addHeader("X-Forwarded-Proto", "https");
        request.setServerName("attacker.example");
        request.setCookies(
                new Cookie(
                        "stirling_redirect_path", URLEncoder.encode(path, StandardCharsets.UTF_8)));
        var response = new MockHttpServletResponse();
        handler.onAuthenticationSuccess(request, response, authentication);
        return response.getRedirectedUrl();
    }
}
