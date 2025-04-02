package stirling.software.SPDF.config.security;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.SPDF.model.ApplicationProperties;

@ExtendWith(MockitoExtension.class)
class CustomLogoutSuccessHandlerTest {

    @Mock private ApplicationProperties applicationProperties;

    @InjectMocks private CustomLogoutSuccessHandler customLogoutSuccessHandler;

    @Test
    void testSuccessfulLogout() throws IOException {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        String logoutPath = "logout=true";

        when(response.isCommitted()).thenReturn(false);
        when(request.getContextPath()).thenReturn("");
        when(response.encodeRedirectURL(logoutPath)).thenReturn(logoutPath);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, null);

        verify(response).sendRedirect(logoutPath);
    }

    @Test
    void testSuccessfulLogoutViaOAuth2() throws IOException {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken oAuth2AuthenticationToken = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security security = mock(ApplicationProperties.Security.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(applicationProperties.getSecurity()).thenReturn(security);
        when(security.getOauth2()).thenReturn(oauth);
        when(oAuth2AuthenticationToken.getAuthorizedClientRegistrationId()).thenReturn("test");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, oAuth2AuthenticationToken);

        verify(response).sendRedirect("http://localhost:8080/login?logout=true");
    }

    @Test
    void testUserIsDisabledRedirect() throws IOException {
        String error = "userIsDisabled";
        String url = "http://localhost:8080";
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security security = mock(ApplicationProperties.Security.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getParameter("oAuth2AutoCreateDisabled")).thenReturn(null);
        when(request.getParameter("oAuth2AdminBlockedUser")).thenReturn(null);
        when(request.getParameter(error)).thenReturn("true");
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(applicationProperties.getSecurity()).thenReturn(security);
        when(security.getOauth2()).thenReturn(oauth);
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
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security security = mock(ApplicationProperties.Security.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter(error)).thenReturn("true");
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(applicationProperties.getSecurity()).thenReturn(security);
        when(security.getOauth2()).thenReturn(oauth);
        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("test");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        verify(response).sendRedirect(url + "/login?errorOAuth=" + errorPath);
    }

    @Test
    void testErrorOAuthRedirect() throws IOException {
        String error = "testError";
        String url = "http://localhost:8080";
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security security = mock(ApplicationProperties.Security.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn("!!!" + error + "!!!");
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(applicationProperties.getSecurity()).thenReturn(security);
        when(security.getOauth2()).thenReturn(oauth);
        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("test");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        verify(response).sendRedirect(url + "/login?errorOAuth=" + error);
    }

    @Test
    void testOAuth2AutoCreateDisabled() throws IOException {
        String error = "oAuth2AutoCreateDisabled";
        String url = "http://localhost:8080";
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security security = mock(ApplicationProperties.Security.class);
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
        when(applicationProperties.getSecurity()).thenReturn(security);
        when(security.getOauth2()).thenReturn(oauth);
        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("test");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        verify(response).sendRedirect(url + "/login?errorOAuth=" + error);
    }

    @Test
    void testOAuth2Error() throws IOException {
        String error = "test";
        String url = "http://localhost:8080";
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security security = mock(ApplicationProperties.Security.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getParameter("oAuth2AutoCreateDisabled")).thenReturn(null);
        when(request.getParameter("oAuth2AdminBlockedUser")).thenReturn(null);
        when(request.getParameter("userIsDisabled")).thenReturn(null);
        when(request.getParameter("error")).thenReturn("!@$!@£" + error + "£$%^*$");
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(applicationProperties.getSecurity()).thenReturn(security);
        when(security.getOauth2()).thenReturn(oauth);
        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("test");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        verify(response).sendRedirect(url + "/login?errorOAuth=" + error);
    }

    @Test
    void testOAuth2BadCredentialsError() throws IOException {
        String error = "badCredentials";
        String url = "http://localhost:8080";
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security security = mock(ApplicationProperties.Security.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getParameter("oAuth2AutoCreateDisabled")).thenReturn(null);
        when(request.getParameter("oAuth2AdminBlockedUser")).thenReturn(null);
        when(request.getParameter("userIsDisabled")).thenReturn(null);
        when(request.getParameter("error")).thenReturn(null);
        when(request.getParameter(error)).thenReturn("true");
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(applicationProperties.getSecurity()).thenReturn(security);
        when(security.getOauth2()).thenReturn(oauth);
        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("test");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        verify(response).sendRedirect(url + "/login?errorOAuth=" + error);
    }

    @Test
    void testOAuth2AdminBlockedUser() throws IOException {
        String error = "oAuth2AdminBlockedUser";
        String url = "http://localhost:8080";
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security security = mock(ApplicationProperties.Security.class);
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
        when(applicationProperties.getSecurity()).thenReturn(security);
        when(security.getOauth2()).thenReturn(oauth);
        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("test");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        verify(response).sendRedirect(url + "/login?errorOAuth=" + error);
    }
}
