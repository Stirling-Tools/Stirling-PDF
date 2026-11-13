package stirling.software.proprietary.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.oauth2.TauriOAuthUtils;
import stirling.software.proprietary.security.service.JwtServiceInterface;

@ExtendWith(MockitoExtension.class)
class CustomLogoutSuccessHandlerTest {

    @Mock private ApplicationProperties.Security securityProperties;

    @Mock private JwtServiceInterface jwtService;

    @Spy private ApplicationProperties applicationProperties = new ApplicationProperties();

    @InjectMocks private CustomLogoutSuccessHandler customLogoutSuccessHandler;

    @Test
    void testSuccessfulLogout() throws IOException {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getParameter("state")).thenReturn(null);
        HttpServletResponse response = mock(HttpServletResponse.class);
        String token = "token";
        String logoutPath = "/login?logout=true";

        when(response.isCommitted()).thenReturn(false);
        when(jwtService.extractToken(request)).thenReturn(token);
        when(request.getContextPath()).thenReturn("");
        when(response.encodeRedirectURL(logoutPath)).thenReturn(logoutPath);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, null);

        verify(response).sendRedirect(logoutPath);
    }

    @Test
    void testSuccessfulLogoutViaJWT() throws IOException {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getParameter("state")).thenReturn(null);
        HttpServletResponse response = mock(HttpServletResponse.class);
        String logoutPath = "/login?logout=true";
        String token = "token";

        when(response.isCommitted()).thenReturn(false);
        when(jwtService.extractToken(request)).thenReturn(token);
        when(request.getContextPath()).thenReturn("");
        when(response.encodeRedirectURL(logoutPath)).thenReturn(logoutPath);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, null);

        verify(response).sendRedirect(logoutPath);
    }

    @Test
    void testSuccessfulLogoutViaOAuth2() throws IOException {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getParameter("state")).thenReturn(null);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken oAuth2AuthenticationToken = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(oAuth2AuthenticationToken.getAuthorizedClientRegistrationId()).thenReturn("test");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, oAuth2AuthenticationToken);

        verify(response).sendRedirect("http://localhost:8080/login?logout=true");
    }

    @Test
    void oauth2LogoutUsesRedirectBaseUrlWhenSet() throws IOException {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getParameter("state")).thenReturn(null);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken oAuth2AuthenticationToken = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(oauth.getRedirectBaseUrl()).thenReturn("https://pdf.example.com/");
        when(oAuth2AuthenticationToken.getAuthorizedClientRegistrationId()).thenReturn("Microsoft");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, oAuth2AuthenticationToken);

        verify(response).sendRedirect("https://pdf.example.com/login?logout=true");
    }

    @Test
    void oauth2LogoutLandsOnSeparateFrontendWhenRedirectBaseUrlSet() throws IOException {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getParameter("state")).thenReturn(null);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken oAuth2AuthenticationToken = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);
        applicationProperties.getSystem().setFrontendUrl("https://app.example.com");

        when(response.isCommitted()).thenReturn(false);
        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(oauth.getRedirectBaseUrl()).thenReturn("https://api.example.com");
        when(oAuth2AuthenticationToken.getAuthorizedClientRegistrationId()).thenReturn("Microsoft");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, oAuth2AuthenticationToken);

        verify(response).sendRedirect("https://app.example.com/login?logout=true");
    }

    @Test
    void testUserIsDisabledRedirect() throws IOException {
        String error = "userIsDisabled";
        String url = "http://localhost:8080";
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getParameter("state")).thenReturn(null);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getParameter("oAuth2AutoCreateDisabled")).thenReturn(null);
        when(request.getParameter("oAuth2AdminBlockedUser")).thenReturn(null);
        when(request.getParameter("oAuth2RequiresLicense")).thenReturn(null);
        when(request.getParameter("saml2RequiresLicense")).thenReturn(null);
        when(request.getParameter("maxUsersReached")).thenReturn(null);
        when(request.getParameter(error)).thenReturn("true");
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("test");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        verify(response).sendRedirect(url + "/login?errorOAuth=" + error);
    }

    @Test
    void testUserAlreadyExistsWebRedirect() throws IOException {
        String error = "oAuth2AuthenticationErrorWeb";
        String errorPath = "userAlreadyExistsWeb";
        String url = "http://localhost:8080";
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getParameter("state")).thenReturn(null);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter(error)).thenReturn("true");
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("test");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        verify(response).sendRedirect(url + "/login?errorOAuth=" + errorPath);
    }

    @Test
    void testErrorOAuthRedirect() throws IOException {
        String error = "testError";
        String url = "http://localhost:8080";
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getParameter("state")).thenReturn(null);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn("!!!" + error + "!!!");
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("test");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        verify(response).sendRedirect(url + "/login?errorOAuth=" + error);
    }

    @Test
    void testOAuth2AutoCreateDisabled() throws IOException {
        String error = "oAuth2AutoCreateDisabled";
        String url = "http://localhost:8080";
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getParameter("state")).thenReturn(null);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getParameter(error)).thenReturn("true");
        when(request.getContextPath()).thenReturn(url);
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("test");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        verify(response).sendRedirect(url + "/login?errorOAuth=" + error);
    }

    @Test
    void testOAuth2Error() throws IOException {
        String error = "test";
        String url = "http://localhost:8080";
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getParameter("state")).thenReturn(null);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getParameter("oAuth2AutoCreateDisabled")).thenReturn(null);
        when(request.getParameter("oAuth2AdminBlockedUser")).thenReturn(null);
        when(request.getParameter("oAuth2RequiresLicense")).thenReturn(null);
        when(request.getParameter("saml2RequiresLicense")).thenReturn(null);
        when(request.getParameter("maxUsersReached")).thenReturn(null);
        when(request.getParameter("userIsDisabled")).thenReturn(null);
        when(request.getParameter("error")).thenReturn("!@$!@£" + error + "£$%^*$");
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("test");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        verify(response).sendRedirect(url + "/login?errorOAuth=" + error);
    }

    @Test
    void testOAuth2BadCredentialsError() throws IOException {
        String error = "badCredentials";
        String url = "http://localhost:8080";
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getParameter("state")).thenReturn(null);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getParameter("oAuth2AutoCreateDisabled")).thenReturn(null);
        when(request.getParameter("oAuth2AdminBlockedUser")).thenReturn(null);
        when(request.getParameter("oAuth2RequiresLicense")).thenReturn(null);
        when(request.getParameter("saml2RequiresLicense")).thenReturn(null);
        when(request.getParameter("maxUsersReached")).thenReturn(null);
        when(request.getParameter("userIsDisabled")).thenReturn(null);
        when(request.getParameter("error")).thenReturn(null);
        when(request.getParameter(error)).thenReturn("true");
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("test");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        verify(response).sendRedirect(url + "/login?errorOAuth=" + error);
    }

    @Test
    void testOAuth2AdminBlockedUser() throws IOException {
        String error = "oAuth2AdminBlockedUser";
        String url = "http://localhost:8080";
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getParameter("state")).thenReturn(null);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getParameter("oAuth2AutoCreateDisabled")).thenReturn(null);
        when(request.getParameter(error)).thenReturn("true");
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("test");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        verify(response).sendRedirect(url + "/login?errorOAuth=" + error);
    }

    @Test
    void unauthenticatedErrorLogoutLandsOnLoginPage() throws IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("oAuth2AutoCreateDisabled", "true");
        MockHttpServletResponse response = new MockHttpServletResponse();

        when(jwtService.extractToken(request)).thenReturn(null);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, null);

        assertEquals("/login?errorOAuth=oAuth2AutoCreateDisabled", response.getRedirectedUrl());
    }

    @Test
    void unauthenticatedErrorLogoutLandsOnSeparateFrontend() throws IOException {
        applicationProperties
                .getSecurity()
                .getOauth2()
                .setRedirectBaseUrl("https://api.example.com");
        applicationProperties.getSystem().setFrontendUrl("https://pdf.example.com");
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("oAuth2AutoCreateDisabled", "true");
        MockHttpServletResponse response = new MockHttpServletResponse();

        when(jwtService.extractToken(request)).thenReturn(null);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, null);

        assertEquals(
                "https://pdf.example.com/login?errorOAuth=oAuth2AutoCreateDisabled",
                response.getRedirectedUrl());
    }

    @ParameterizedTest
    @CsvSource(
            value = {
                "false, '', '', /stirling, /stirling/auth/callback/tauri",
                "true, '', '', /stirling, /stirling/auth/callback/tauri",
                "false, '', https://pdf.example.com, '', /auth/callback/tauri",
                "true, https://api.example.com, '', /stirling, https://api.example.com/auth/callback/tauri",
                "false, https://api.example.com, https://pdf.example.com/, /stirling, https://pdf.example.com/auth/callback/tauri",
                "true, https://example.com/pdf/, '', /stirling, https://example.com/pdf/auth/callback/tauri"
            },
            emptyValue = "")
    void desktopRejectionReturnsToCallbackAfterLogout(
            boolean authenticated,
            String redirectBaseUrl,
            String frontendUrl,
            String contextPath,
            String expectedCallback)
            throws IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath(contextPath);
        request.setParameter("oAuth2AutoCreateDisabled", "true");
        String nonce = "n+once&next=//evil.example/#fragment";
        String state = "tauri:state:" + nonce;
        request.setParameter("state", state);
        request.setCookies(new Cookie(TauriOAuthUtils.SPA_REDIRECT_COOKIE, "/auth/callback"));
        applicationProperties.getSecurity().getOauth2().setRedirectBaseUrl(redirectBaseUrl);
        applicationProperties.getSystem().setFrontendUrl(frontendUrl);
        MockHttpServletResponse response = new MockHttpServletResponse();
        OAuth2AuthenticationToken authentication =
                authenticated ? mock(OAuth2AuthenticationToken.class) : null;

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        URI redirect = URI.create(response.getRedirectedUrl());
        URI expected = URI.create(expectedCallback);
        assertEquals(expected.getScheme(), redirect.getScheme());
        assertEquals(expected.getRawAuthority(), redirect.getRawAuthority());
        assertEquals(expected.getPath(), redirect.getPath());
        assertEquals(null, redirect.getFragment());
        String[] query = redirect.getRawQuery().split("&");
        assertEquals(3, query.length);
        assertEquals("errorOAuth=oAuth2AutoCreateDisabled", query[0]);
        assertEquals("state=" + state, URLDecoder.decode(query[1], StandardCharsets.UTF_8));
        assertEquals("nonce=" + nonce, URLDecoder.decode(query[2], StandardCharsets.UTF_8));
        assertEquals(0, response.getCookie(TauriOAuthUtils.SPA_REDIRECT_COOKIE).getMaxAge());
    }
}
