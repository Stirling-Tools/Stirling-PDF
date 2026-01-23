package stirling.software.proprietary.security;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.URL;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClient.RequestHeadersUriSpec;
import org.springframework.web.client.RestClient.ResponseSpec;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.service.JwtServiceInterface;

/**
 * Tests for CustomLogoutSuccessHandler.
 *
 * <p>The handler uses JWT-based authentication to determine logout strategy: - OAUTH2 authType:
 * Redirects to OIDC provider's end_session_endpoint - SAML2 authType: Delegates to SAML logout
 * handler - Other/null: Local logout redirect
 */
@ExtendWith(MockitoExtension.class)
class CustomLogoutSuccessHandlerTest {

    @Mock private ApplicationProperties.Security securityProperties;

    @Mock private JwtServiceInterface jwtService;

    @Mock private ApplicationProperties.Security.SAML2 saml2;

    private CustomLogoutSuccessHandler customLogoutSuccessHandler;

    @BeforeEach
    void setUp() {
        customLogoutSuccessHandler = new CustomLogoutSuccessHandler(securityProperties, jwtService);
    }

    @Test
    void testSuccessfulLogout_NullAuthentication() throws IOException {
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
    void testJwtLogout_WebAuthType_RedirectsToLocalLogout() throws IOException {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        JwtAuthenticationToken jwtAuth = mock(JwtAuthenticationToken.class);
        Jwt jwt = mock(Jwt.class);
        String logoutPath = "/login?logout=true";

        when(response.isCommitted()).thenReturn(false);
        when(request.getContextPath()).thenReturn("");
        when(response.encodeRedirectURL(anyString())).thenReturn(logoutPath);

        when(jwtAuth.getToken()).thenReturn(jwt);
        when(jwt.getClaims()).thenReturn(Map.of("authType", "WEB"));

        customLogoutSuccessHandler.onLogoutSuccess(request, response, jwtAuth);

        verify(response).sendRedirect(logoutPath);
    }

    @Test
    void testJwtLogout_OAuth2AuthType_WithConfiguredEndpoint_RedirectsToProvider()
            throws IOException {
        String issuerUrl = "https://keycloak.example.com/realms/test";
        String clientId = "stirling-pdf";
        String endSessionEndpoint = issuerUrl + "/protocol/openid-connect/logout";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        JwtAuthenticationToken jwtAuth = mock(JwtAuthenticationToken.class);
        Jwt jwt = mock(Jwt.class);
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
        when(request.getHeader("Accept")).thenReturn("text/html");
        when(request.getHeader("X-Requested-With")).thenReturn(null);

        when(jwtAuth.getToken()).thenReturn(jwt);
        when(jwt.getClaims()).thenReturn(Map.of("authType", "OAUTH2"));
        when(jwt.getIssuer()).thenReturn(new URL(issuerUrl));

        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(oauth.getClient()).thenReturn(client);
        when(client.getEndSessionEndpoint()).thenReturn(endSessionEndpoint);
        when(oauth.getClientId()).thenReturn(clientId);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, jwtAuth);

        verify(response).sendRedirect(contains(endSessionEndpoint));
        verify(response).sendRedirect(contains("client_id=" + clientId));
        verify(response).sendRedirect(contains("post_logout_redirect_uri="));
    }

    @Test
    void testJwtLogout_OAuth2AuthType_WithIdToken_IncludesIdTokenHint() throws IOException {
        String issuerUrl = "https://keycloak.example.com/realms/test";
        String clientId = "stirling-pdf";
        String idTokenValue = "test.id.token";
        String endSessionEndpoint = issuerUrl + "/protocol/openid-connect/logout";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        JwtAuthenticationToken jwtAuth = mock(JwtAuthenticationToken.class);
        Jwt jwt = mock(Jwt.class);
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
        when(request.getHeader("Accept")).thenReturn("text/html");
        when(request.getHeader("X-Requested-With")).thenReturn(null);

        when(jwtAuth.getToken()).thenReturn(jwt);
        when(jwt.getClaims()).thenReturn(Map.of("authType", "OAUTH2", "id_token", idTokenValue));
        when(jwt.getIssuer()).thenReturn(new URL(issuerUrl));

        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(oauth.getClient()).thenReturn(client);
        when(client.getEndSessionEndpoint()).thenReturn(endSessionEndpoint);
        when(oauth.getClientId()).thenReturn(clientId);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, jwtAuth);

        verify(response).sendRedirect(contains("id_token_hint=" + idTokenValue));
    }

    @Test
    void testJwtLogout_OAuth2AuthType_NoEndpoint_FallsBackToLocalLogout() throws IOException {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        JwtAuthenticationToken jwtAuth = mock(JwtAuthenticationToken.class);
        Jwt jwt = mock(Jwt.class);
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
        when(request.getHeader("Accept")).thenReturn("text/html");
        when(request.getHeader("X-Requested-With")).thenReturn(null);

        when(jwtAuth.getToken()).thenReturn(jwt);
        when(jwt.getClaims()).thenReturn(Map.of("authType", "OAUTH2"));
        when(jwt.getIssuer()).thenReturn(null);

        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(oauth.getClient()).thenReturn(client);
        when(client.getEndSessionEndpoint()).thenReturn(null);
        when(client.getKeycloak()).thenReturn(null);
        when(oauth.getIssuer()).thenReturn("");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, jwtAuth);

        verify(response).sendRedirect("http://localhost:8080/login?logout=true");
    }

    @Test
    void testJwtLogout_ApiRequest_ReturnsJsonWithLogoutUrl() throws IOException {
        String issuerUrl = "https://keycloak.example.com/realms/test";
        String clientId = "stirling-pdf";
        String endSessionEndpoint = issuerUrl + "/protocol/openid-connect/logout";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        JwtAuthenticationToken jwtAuth = mock(JwtAuthenticationToken.class);
        Jwt jwt = mock(Jwt.class);
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
        when(jwt.getIssuer()).thenReturn(new URL(issuerUrl));

        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(oauth.getClient()).thenReturn(client);
        when(client.getEndSessionEndpoint()).thenReturn(endSessionEndpoint);
        when(oauth.getClientId()).thenReturn(clientId);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, jwtAuth);

        verify(response).setStatus(HttpServletResponse.SC_OK);
        verify(response).setContentType("application/json");
        verify(response).setCharacterEncoding("UTF-8");

        String jsonResponse = stringWriter.toString();
        assert jsonResponse.contains("\"logoutUrl\":");
        assert jsonResponse.contains(issuerUrl);
    }

    @Test
    void testJwtLogout_XhrRequest_ReturnsJsonWithLogoutUrl() throws IOException {
        String issuerUrl = "https://keycloak.example.com/realms/test";
        String clientId = "stirling-pdf";
        String endSessionEndpoint = issuerUrl + "/protocol/openid-connect/logout";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        JwtAuthenticationToken jwtAuth = mock(JwtAuthenticationToken.class);
        Jwt jwt = mock(Jwt.class);
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
        when(request.getHeader("Accept")).thenReturn("text/html");
        when(request.getHeader("X-Requested-With")).thenReturn("XMLHttpRequest");
        when(response.getWriter()).thenReturn(printWriter);

        when(jwtAuth.getToken()).thenReturn(jwt);
        when(jwt.getClaims()).thenReturn(Map.of("authType", "OAUTH2"));
        when(jwt.getIssuer()).thenReturn(new URL(issuerUrl));

        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(oauth.getClient()).thenReturn(client);
        when(client.getEndSessionEndpoint()).thenReturn(endSessionEndpoint);
        when(oauth.getClientId()).thenReturn(clientId);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, jwtAuth);

        verify(response).setStatus(HttpServletResponse.SC_OK);
        verify(response).setContentType("application/json");
    }

    @Test
    void testJwtLogout_Saml2AuthType_WithSloEnabled_NoHandler_LocalLogout() throws IOException {
        // When SLO is enabled but no SAML logout handler is configured, falls back to local logout
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        JwtAuthenticationToken jwtAuth = mock(JwtAuthenticationToken.class);
        Jwt jwt = mock(Jwt.class);
        String logoutPath = "/login?logout=true";

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("SAMLResponse")).thenReturn(null);
        when(request.getContextPath()).thenReturn("");
        when(response.encodeRedirectURL(anyString())).thenReturn(logoutPath);

        when(jwtAuth.getToken()).thenReturn(jwt);
        when(jwt.getClaims())
                .thenReturn(
                        Map.of(
                                "authType", "SAML2",
                                "sub", "testuser",
                                "samlNameId", "testuser@example.com",
                                "samlRegistrationId", "test-idp"));

        when(securityProperties.getSaml2()).thenReturn(saml2);
        when(saml2.getEnableSingleLogout()).thenReturn(true);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, jwtAuth);

        // Falls back to local logout since no SAML handler is configured
        verify(response).sendRedirect(logoutPath);
    }

    @Test
    void testJwtLogout_Saml2AuthType_WithSloDisabled_LocalLogout() throws IOException {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        JwtAuthenticationToken jwtAuth = mock(JwtAuthenticationToken.class);
        Jwt jwt = mock(Jwt.class);
        String logoutPath = "/login?logout=true";

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("SAMLResponse")).thenReturn(null);
        when(request.getContextPath()).thenReturn("");
        when(response.encodeRedirectURL(anyString())).thenReturn(logoutPath);

        when(jwtAuth.getToken()).thenReturn(jwt);
        when(jwt.getClaims()).thenReturn(Map.of("authType", "SAML2"));

        when(securityProperties.getSaml2()).thenReturn(saml2);
        when(saml2.getEnableSingleLogout()).thenReturn(false);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, jwtAuth);

        verify(response).sendRedirect(logoutPath);
    }

    @Test
    void testErrorParameterHandling_UserIsDisabled() throws IOException {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        String logoutPath = "/login?errorOAuth=userIsDisabled";

        when(response.isCommitted()).thenReturn(false);
        when(request.getContextPath()).thenReturn("");
        when(response.encodeRedirectURL(anyString())).thenReturn(logoutPath);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getParameter("oAuth2AutoCreateDisabled")).thenReturn(null);
        when(request.getParameter("oAuth2AdminBlockedUser")).thenReturn(null);
        when(request.getParameter("oAuth2RequiresLicense")).thenReturn(null);
        when(request.getParameter("saml2RequiresLicense")).thenReturn(null);
        when(request.getParameter("maxUsersReached")).thenReturn(null);
        when(request.getParameter("userIsDisabled")).thenReturn("true");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, null);

        verify(response).sendRedirect(logoutPath);
    }

    @Test
    void testErrorParameterHandling_BadCredentials() throws IOException {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        String logoutPath = "/login?errorOAuth=badCredentials";

        when(response.isCommitted()).thenReturn(false);
        when(request.getContextPath()).thenReturn("");
        when(response.encodeRedirectURL(anyString())).thenReturn(logoutPath);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getParameter("oAuth2AutoCreateDisabled")).thenReturn(null);
        when(request.getParameter("oAuth2AdminBlockedUser")).thenReturn(null);
        when(request.getParameter("oAuth2RequiresLicense")).thenReturn(null);
        when(request.getParameter("saml2RequiresLicense")).thenReturn(null);
        when(request.getParameter("maxUsersReached")).thenReturn(null);
        when(request.getParameter("userIsDisabled")).thenReturn(null);
        when(request.getParameter("error")).thenReturn(null);
        when(request.getParameter("badCredentials")).thenReturn("true");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, null);

        verify(response).sendRedirect(logoutPath);
    }

    @Test
    void testOidcDiscovery_CachesEndpoint() throws IOException {
        String issuerUrl = "https://authentik.example.com/application/o/stirling-pdf";
        String discoveredEndpoint = "https://authentik.example.com/application/o/end-session/";
        String clientId = "stirling-pdf";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        JwtAuthenticationToken jwtAuth = mock(JwtAuthenticationToken.class);
        Jwt jwt = mock(Jwt.class);
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
        when(request.getHeader("Accept")).thenReturn("text/html");
        when(request.getHeader("X-Requested-With")).thenReturn(null);

        when(jwtAuth.getToken()).thenReturn(jwt);
        when(jwt.getClaims()).thenReturn(Map.of("authType", "OAUTH2"));
        when(jwt.getIssuer()).thenReturn(new URL(issuerUrl));

        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(oauth.getClient()).thenReturn(client);
        when(client.getEndSessionEndpoint()).thenReturn(null);
        when(oauth.getClientId()).thenReturn(clientId);

        try (MockedStatic<RestClient> restClientStatic = mockStatic(RestClient.class)) {
            @SuppressWarnings({"rawtypes", "unchecked"})
            RestClient.Builder mockBuilder = mock(RestClient.Builder.class);
            @SuppressWarnings({"rawtypes", "unchecked"})
            RestClient mockRestClient = mock(RestClient.class);
            @SuppressWarnings({"rawtypes", "unchecked"})
            RequestHeadersUriSpec mockRequestSpec = mock(RequestHeadersUriSpec.class);
            @SuppressWarnings({"rawtypes", "unchecked"})
            ResponseSpec mockResponseSpec = mock(ResponseSpec.class);

            restClientStatic.when(RestClient::builder).thenReturn(mockBuilder);
            when(mockBuilder.baseUrl(anyString())).thenReturn(mockBuilder);
            when(mockBuilder.defaultHeaders(any())).thenReturn(mockBuilder);
            when(mockBuilder.build()).thenReturn(mockRestClient);
            when(mockRestClient.get()).thenReturn(mockRequestSpec);
            when(mockRequestSpec.retrieve()).thenReturn(mockResponseSpec);
            when(mockResponseSpec.onStatus(any(), any())).thenReturn(mockResponseSpec);

            Map<String, Object> discoveryDoc = Map.of("end_session_endpoint", discoveredEndpoint);
            when(mockResponseSpec.body(Map.class)).thenReturn(discoveryDoc);

            customLogoutSuccessHandler.onLogoutSuccess(request, response, jwtAuth);

            verify(response).sendRedirect(contains(discoveredEndpoint));
        }
    }
}
