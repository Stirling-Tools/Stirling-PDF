package stirling.software.proprietary.security.oauth2;

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
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;

import jakarta.servlet.http.Cookie;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

class OAuth2RedirectTest {
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
        assertThat(login(null, path)).isEqualTo("/auth/callback#access_token=test-token");
    }

    @Test
    void configuredRedirectBaseAndLocalCallbackRemainSupported() throws Exception {
        assertThat(login("https://app.example", "/app/auth/callback"))
                .isEqualTo("https://app.example/app/auth/callback#access_token=test-token");
        assertThat(login(null, "/app/auth/callback"))
                .isEqualTo("/app/auth/callback#access_token=test-token");
    }

    private String login(String redirectBaseUrl, String path) throws Exception {
        var properties = new ApplicationProperties();
        var oauth2 = properties.getSecurity().getOauth2();
        oauth2.setRedirectBaseUrl(redirectBaseUrl);
        oauth2.setAutoCreateUser(true);
        oauth2.setBlockRegistration(false);
        var jwt = mock(JwtServiceInterface.class);
        when(jwt.isJwtEnabled()).thenReturn(true);
        when(jwt.generateToken(any(Authentication.class), anyMap())).thenReturn("test-token");
        var users = mock(UserService.class);
        when(users.usernameExistsIgnoreCase("verified-user")).thenReturn(true);
        var handler =
                new CustomOAuth2AuthenticationSuccessHandler(
                        mock(LoginAttemptService.class),
                        oauth2,
                        users,
                        jwt,
                        mock(UserLicenseSettingsService.class),
                        properties);
        var principal =
                new DefaultOAuth2User(
                        List.of(new SimpleGrantedAuthority("ROLE_USER")),
                        Map.of("sub", "provider-sub", "name", "verified-user"),
                        "name");
        var authentication =
                new OAuth2AuthenticationToken(principal, principal.getAuthorities(), "corpidp");
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
