package stirling.software.proprietary.security;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.service.JwtServiceInterface;

@ExtendWith(MockitoExtension.class)
class CustomLogoutSuccessHandlerTest {

    @Mock private ApplicationProperties.Security securityProperties;

    @Mock private JwtServiceInterface jwtService;

    private CustomLogoutSuccessHandler customLogoutSuccessHandler;

    @BeforeEach
    void setUp() {
        customLogoutSuccessHandler = new CustomLogoutSuccessHandler(securityProperties, jwtService);
    }

    @Test
    void testSuccessfulLogout() throws IOException {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        String logoutPath = "/login?logout=true";

        when(response.isCommitted()).thenReturn(false);
        when(request.getContextPath()).thenReturn("");
        when(response.encodeRedirectURL(anyString())).thenReturn(logoutPath);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, null);

        verify(response).sendRedirect(logoutPath);
    }

    @Test
    void testSuccessfulLogoutViaJWT() throws IOException {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        String logoutPath = "/login?logout=true";

        when(response.isCommitted()).thenReturn(false);
        when(request.getContextPath()).thenReturn("");
        when(response.encodeRedirectURL(anyString())).thenReturn(logoutPath);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, null);

        verify(response).sendRedirect(logoutPath);
    }

    // OAuth2 and SAML2 tests using OAuth2AuthenticationToken/Saml2Authentication are obsolete
    // with the new JWT-based authentication flow. All authentication now uses
    // JwtAuthenticationToken
    // with authType claim to determine logout method. See JWT logout tests below for current
    // implementation.

    // ========== JWT-BASED LOGOUT TESTS (CURRENT IMPLEMENTATION) ==========

    @Test
    void testJwtLogout_ApiRequest_ReturnsJsonWithLogoutUrl() throws IOException {
        // Test that API requests (Accept: application/json) get JSON response with logout URL
        String issuerUrl = "https://keycloak.example.com/realms/test";
        String clientId = "stirling-pdf";
        String endSessionEndpoint = issuerUrl + "/protocol/openid-connect/logout";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
                jwtAuth =
                        mock(
                                org.springframework.security.oauth2.server.resource.authentication
                                        .JwtAuthenticationToken.class);
        org.springframework.security.oauth2.jwt.Jwt jwt =
                mock(org.springframework.security.oauth2.jwt.Jwt.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);
        ApplicationProperties.Security.OAUTH2.Client client =
                mock(ApplicationProperties.Security.OAUTH2.Client.class);

        StringWriter stringWriter = new StringWriter();
        PrintWriter printWriter = new PrintWriter(stringWriter);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(request.getHeader("Accept")).thenReturn("application/json"); // API request
        when(request.getHeader("X-Requested-With")).thenReturn(null);
        when(response.getWriter()).thenReturn(printWriter);

        when(jwtAuth.getToken()).thenReturn(jwt);
        when(jwt.getClaims()).thenReturn(Map.of("authType", "OAUTH2"));
        when(jwt.getIssuer()).thenReturn(new java.net.URL(issuerUrl));

        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(oauth.getClient()).thenReturn(client);
        when(client.getEndSessionEndpoint()).thenReturn(endSessionEndpoint); // Configured endpoint
        when(oauth.getClientId()).thenReturn(clientId);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, jwtAuth);

        // Verify JSON response
        verify(response).setStatus(HttpServletResponse.SC_OK);
        verify(response).setContentType("application/json");
        verify(response).setCharacterEncoding("UTF-8");
        verify(response).getWriter();

        String jsonResponse = stringWriter.toString();
        assert jsonResponse.contains("\"logoutUrl\":");
        assert jsonResponse.contains(issuerUrl);
    }

    @Test
    void testJwtLogout_XhrRequest_ReturnsJsonWithLogoutUrl() throws IOException {
        // Test that XHR requests (X-Requested-With: XMLHttpRequest) get JSON response
        String issuerUrl = "https://keycloak.example.com/realms/test";
        String clientId = "stirling-pdf";
        String endSessionEndpoint = issuerUrl + "/protocol/openid-connect/logout";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
                jwtAuth =
                        mock(
                                org.springframework.security.oauth2.server.resource.authentication
                                        .JwtAuthenticationToken.class);
        org.springframework.security.oauth2.jwt.Jwt jwt =
                mock(org.springframework.security.oauth2.jwt.Jwt.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);
        ApplicationProperties.Security.OAUTH2.Client client =
                mock(ApplicationProperties.Security.OAUTH2.Client.class);

        StringWriter stringWriter = new StringWriter();
        PrintWriter printWriter = new PrintWriter(stringWriter);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(request.getHeader("Accept")).thenReturn("text/html"); // Not JSON Accept header
        when(request.getHeader("X-Requested-With")).thenReturn("XMLHttpRequest"); // XHR request
        when(response.getWriter()).thenReturn(printWriter);

        when(jwtAuth.getToken()).thenReturn(jwt);
        when(jwt.getClaims()).thenReturn(Map.of("authType", "OAUTH2"));
        when(jwt.getIssuer()).thenReturn(new java.net.URL(issuerUrl));

        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(oauth.getClient()).thenReturn(client);
        when(client.getEndSessionEndpoint()).thenReturn(endSessionEndpoint); // Configured endpoint
        when(oauth.getClientId()).thenReturn(clientId);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, jwtAuth);

        // Verify JSON response
        verify(response).setStatus(HttpServletResponse.SC_OK);
        verify(response).setContentType("application/json");
    }

    @Test
    void testJwtLogout_BrowserRequest_RedirectsToLogoutUrl() throws IOException {
        // Test that browser requests (no Accept: application/json) get redirected
        String issuerUrl = "https://keycloak.example.com/realms/test";
        String clientId = "stirling-pdf";
        String endSessionEndpoint = issuerUrl + "/protocol/openid-connect/logout";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
                jwtAuth =
                        mock(
                                org.springframework.security.oauth2.server.resource.authentication
                                        .JwtAuthenticationToken.class);
        org.springframework.security.oauth2.jwt.Jwt jwt =
                mock(org.springframework.security.oauth2.jwt.Jwt.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);
        ApplicationProperties.Security.OAUTH2.Client client =
                mock(ApplicationProperties.Security.OAUTH2.Client.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(request.getHeader("Accept")).thenReturn("text/html"); // Browser request
        when(request.getHeader("X-Requested-With")).thenReturn(null);

        when(jwtAuth.getToken()).thenReturn(jwt);
        when(jwt.getClaims()).thenReturn(Map.of("authType", "OAUTH2"));
        when(jwt.getIssuer()).thenReturn(new java.net.URL(issuerUrl));

        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(oauth.getClient()).thenReturn(client);
        when(client.getEndSessionEndpoint()).thenReturn(endSessionEndpoint); // Configured endpoint
        when(oauth.getClientId()).thenReturn(clientId);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, jwtAuth);

        // Verify redirect (not JSON)
        verify(response).sendRedirect(contains(endSessionEndpoint));
        verify(response).sendRedirect(contains("client_id=" + clientId));
        verify(response).sendRedirect(contains("post_logout_redirect_uri="));
    }

    @Test
    void testJwtLogout_ApiRequest_NoOidcEndpoint_ReturnsLocalLogoutUrl() throws IOException {
        // Test that API requests with no OIDC endpoint return local logout URL as JSON
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
                jwtAuth =
                        mock(
                                org.springframework.security.oauth2.server.resource.authentication
                                        .JwtAuthenticationToken.class);
        org.springframework.security.oauth2.jwt.Jwt jwt =
                mock(org.springframework.security.oauth2.jwt.Jwt.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);
        ApplicationProperties.Security.OAUTH2.Client client =
                mock(ApplicationProperties.Security.OAUTH2.Client.class);

        StringWriter stringWriter = new StringWriter();
        PrintWriter printWriter = new PrintWriter(stringWriter);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(request.getHeader("Accept")).thenReturn("application/json");
        when(request.getHeader("X-Requested-With")).thenReturn(null);
        when(response.getWriter()).thenReturn(printWriter);

        when(jwtAuth.getToken()).thenReturn(jwt);
        when(jwt.getClaims()).thenReturn(Map.of("authType", "OAUTH2"));

        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(oauth.getClient()).thenReturn(client);
        when(client.getEndSessionEndpoint()).thenReturn(null);
        when(client.getKeycloak()).thenReturn(null); // No Keycloak configured
        when(oauth.getIssuer()).thenReturn(""); // No issuer

        customLogoutSuccessHandler.onLogoutSuccess(request, response, jwtAuth);

        // Verify JSON response with local logout URL
        verify(response).setStatus(HttpServletResponse.SC_OK);
        verify(response).setContentType("application/json");

        String jsonResponse = stringWriter.toString();
        assert jsonResponse.contains("\"logoutUrl\":");
        assert jsonResponse.contains("/login?logout=true");
    }
}
