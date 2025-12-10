package stirling.software.proprietary.security;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPrivateKey;
import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.saml2.provider.service.authentication.Saml2Authentication;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.oauth2.KeycloakProvider;
import stirling.software.proprietary.security.saml2.CertificateUtils;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;
import stirling.software.proprietary.security.service.JwtServiceInterface;

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
    void testSuccessfulLogout() throws IOException {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        String logoutPath = "/login?logout=true";

        when(response.isCommitted()).thenReturn(false);
        when(securityProperties.getSaml2()).thenReturn(saml2);
        when(saml2.getEnableSingleLogout()).thenReturn(false);
        when(request.getContextPath()).thenReturn("");
        when(response.encodeRedirectURL(logoutPath)).thenReturn(logoutPath);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, null);

        verify(response).sendRedirect(logoutPath);
    }

    @Test
    void testSuccessfulLogoutViaJWT() throws IOException {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        String logoutPath = "/login?logout=true";

        when(response.isCommitted()).thenReturn(false);
        when(securityProperties.getSaml2()).thenReturn(saml2);
        when(saml2.getEnableSingleLogout()).thenReturn(false);
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
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("SAMLResponse")).thenReturn(null);
        when(securityProperties.getSaml2()).thenReturn(saml2);
        when(saml2.getEnableSingleLogout()).thenReturn(false);
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
    void testUserIsDisabledRedirect() throws IOException {
        String error = "userIsDisabled";
        String url = "http://localhost:8080";
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("SAMLResponse")).thenReturn(null);
        when(securityProperties.getSaml2()).thenReturn(saml2);
        when(saml2.getEnableSingleLogout()).thenReturn(false);
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
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("SAMLResponse")).thenReturn(null);
        when(securityProperties.getSaml2()).thenReturn(saml2);
        when(saml2.getEnableSingleLogout()).thenReturn(false);
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
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("SAMLResponse")).thenReturn(null);
        when(securityProperties.getSaml2()).thenReturn(saml2);
        when(saml2.getEnableSingleLogout()).thenReturn(false);
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
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("SAMLResponse")).thenReturn(null);
        when(securityProperties.getSaml2()).thenReturn(saml2);
        when(saml2.getEnableSingleLogout()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
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
    void testOAuth2Error() throws IOException {
        String error = "test";
        String url = "http://localhost:8080";
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("SAMLResponse")).thenReturn(null);
        when(securityProperties.getSaml2()).thenReturn(saml2);
        when(saml2.getEnableSingleLogout()).thenReturn(false);
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
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("SAMLResponse")).thenReturn(null);
        when(securityProperties.getSaml2()).thenReturn(saml2);
        when(saml2.getEnableSingleLogout()).thenReturn(false);
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
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("SAMLResponse")).thenReturn(null);
        when(securityProperties.getSaml2()).thenReturn(saml2);
        when(saml2.getEnableSingleLogout()).thenReturn(false);
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
    void testKeycloakLogoutWithOidcUser_IncludesIdTokenHint() throws IOException {
        // Test that Keycloak logout with OidcUser includes id_token_hint parameter
        String idTokenValue = "test.id.token";
        String issuerUrl = "https://keycloak.example.com/realms/test";
        String clientId = "stirling-pdf";
        String redirectUrl = "http://localhost:8080/login?logout=true";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);
        ApplicationProperties.Security.OAUTH2.Client client =
                mock(ApplicationProperties.Security.OAUTH2.Client.class);
        KeycloakProvider keycloakProvider = mock(KeycloakProvider.class);

        // Create OidcUser with id token
        OidcIdToken idToken =
                new OidcIdToken(
                        idTokenValue,
                        Instant.now(),
                        Instant.now().plusSeconds(3600),
                        java.util.Map.of("sub", "user123"));
        OidcUser oidcUser = mock(OidcUser.class);
        when(oidcUser.getIdToken()).thenReturn(idToken);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(response.encodeRedirectURL(anyString())).thenReturn(redirectUrl);

        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(oauth.getClient()).thenReturn(client);
        when(oauth.getIssuer()).thenReturn(""); // Empty custom issuer
        when(client.getKeycloak()).thenReturn(keycloakProvider);
        when(keycloakProvider.getIssuer()).thenReturn(issuerUrl);
        when(keycloakProvider.getClientId()).thenReturn(clientId);

        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("keycloak");
        when(authentication.getPrincipal()).thenReturn(oidcUser);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        // Verify the logout URL contains id_token_hint
        verify(response)
                .sendRedirect(
                        contains(issuerUrl + "/protocol/openid-connect/logout?id_token_hint="));
        verify(response).sendRedirect(contains("id_token_hint=" + idTokenValue));
        verify(response).sendRedirect(contains("post_logout_redirect_uri="));
        verify(response).sendRedirect(contains("client_id=" + clientId));
    }

    @Test
    void testKeycloakLogoutWithoutOidcUser_FallsBackToClientId() throws IOException {
        // Test that Keycloak logout without OidcUser falls back to client_id only
        String issuerUrl = "https://keycloak.example.com/realms/test";
        String clientId = "stirling-pdf";
        String redirectUrl = "http://localhost:8080/login?logout=true";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);
        ApplicationProperties.Security.OAUTH2.Client client =
                mock(ApplicationProperties.Security.OAUTH2.Client.class);
        KeycloakProvider keycloakProvider = mock(KeycloakProvider.class);

        // Create non-OIDC OAuth2User (no id token available)
        OAuth2User oauth2User = mock(OAuth2User.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(response.encodeRedirectURL(anyString())).thenReturn(redirectUrl);

        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(oauth.getClient()).thenReturn(client);
        when(oauth.getIssuer()).thenReturn(""); // Empty custom issuer
        when(client.getKeycloak()).thenReturn(keycloakProvider);
        when(keycloakProvider.getIssuer()).thenReturn(issuerUrl);
        when(keycloakProvider.getClientId()).thenReturn(clientId);

        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("keycloak");
        when(authentication.getPrincipal()).thenReturn(oauth2User);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        // Verify the logout URL uses client_id without id_token_hint
        verify(response)
                .sendRedirect(
                        issuerUrl
                                + "/protocol/openid-connect/logout?client_id="
                                + clientId
                                + "&post_logout_redirect_uri="
                                + redirectUrl);
    }

    @Test
    void testKeycloakLogoutWithCustomOAuth_UsesCustomIssuer() throws IOException {
        // Test that custom OAuth provider uses custom issuer URL
        String customIssuerUrl = "https://custom-oauth.example.com";
        String clientId = "stirling-pdf";
        String redirectUrl = "http://localhost:8080/login?logout=true";
        String idTokenValue = "custom.id.token";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        ApplicationProperties.Security.OAUTH2 oauth =
                mock(ApplicationProperties.Security.OAUTH2.class);
        ApplicationProperties.Security.OAUTH2.Client client =
                mock(ApplicationProperties.Security.OAUTH2.Client.class);
        KeycloakProvider keycloakProvider = mock(KeycloakProvider.class);

        // Create OidcUser with id token
        OidcIdToken idToken =
                new OidcIdToken(
                        idTokenValue,
                        Instant.now(),
                        Instant.now().plusSeconds(3600),
                        java.util.Map.of("sub", "user123"));
        OidcUser oidcUser = mock(OidcUser.class);
        when(oidcUser.getIdToken()).thenReturn(idToken);

        when(response.isCommitted()).thenReturn(false);
        when(request.getParameter("oAuth2AuthenticationErrorWeb")).thenReturn(null);
        when(request.getParameter("errorOAuth")).thenReturn(null);
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");
        when(response.encodeRedirectURL(anyString())).thenReturn(redirectUrl);

        when(securityProperties.getOauth2()).thenReturn(oauth);
        when(oauth.getClient()).thenReturn(client);
        when(client.getKeycloak()).thenReturn(keycloakProvider);
        when(keycloakProvider.getIssuer()).thenReturn(""); // Empty keycloak issuer
        when(keycloakProvider.getClientId()).thenReturn(clientId);
        when(oauth.getIssuer()).thenReturn(customIssuerUrl); // Use custom issuer

        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("keycloak");
        when(authentication.getPrincipal()).thenReturn(oidcUser);

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        // Verify custom issuer is used
        verify(response)
                .sendRedirect(
                        contains(
                                customIssuerUrl
                                        + "/protocol/openid-connect/logout?id_token_hint="));
    }

    @Test
    void testGitHubLogout_RedirectsToLocalLogout() throws IOException {
        // Test that GitHub logout redirects to local logout page (no provider logout)
        String redirectUrl = "http://localhost:8080/login?logout=true";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
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
        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("github");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        // Verify redirect to local logout page
        verify(response).sendRedirect(redirectUrl);
    }

    @Test
    void testGoogleLogout_RedirectsToLocalLogout() throws IOException {
        // Test that Google logout redirects to local logout page (no provider logout)
        String redirectUrl = "http://localhost:8080/login?logout=true";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
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
        when(authentication.getAuthorizedClientRegistrationId()).thenReturn("google");

        customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

        // Verify redirect to local logout page
        verify(response).sendRedirect(redirectUrl);
    }

    @Test
    void testSaml2LogoutSuccess_RedirectsToIdentityProvider() throws Exception {
        // Test successful SAML2 logout with redirect to IdP
        // Note: This test verifies the handler processes SAML2 logout without exceptions
        // In a real scenario, SamlClient would redirect to the IdP
        String registrationId = "test-saml";
        String providerName = "TestIdP";
        String nameIdValue = "user@example.com";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        Saml2Authentication authentication = mock(Saml2Authentication.class);
        CustomSaml2AuthenticatedPrincipal principal = mock(CustomSaml2AuthenticatedPrincipal.class);
        ApplicationProperties.Security.SAML2 saml2Config =
                mock(ApplicationProperties.Security.SAML2.class);

        Resource certResource = mock(Resource.class);
        Resource keyResource = mock(Resource.class);
        X509Certificate certificate = mock(X509Certificate.class);
        RSAPrivateKey privateKey = mock(RSAPrivateKey.class);

        when(response.isCommitted()).thenReturn(false);
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");

        when(securityProperties.getSaml2()).thenReturn(saml2Config);
        when(saml2Config.getRegistrationId()).thenReturn(registrationId);
        when(saml2Config.getProvider()).thenReturn(providerName);
        when(saml2Config.getSpCert()).thenReturn(certResource);
        when(saml2Config.getPrivateKey()).thenReturn(keyResource);
        when(saml2Config.getIdpSingleLogoutUrl()).thenReturn("https://idp.example.com/logout");
        when(saml2Config.getIdpIssuer()).thenReturn("https://idp.example.com");

        when(authentication.getPrincipal()).thenReturn(principal);
        when(principal.name()).thenReturn(nameIdValue);

        when(appConfig.getBaseUrl()).thenReturn("http://localhost");
        when(appConfig.getServerPort()).thenReturn("8080");

        // Use static mocking for CertificateUtils
        try (MockedStatic<CertificateUtils> certUtils = mockStatic(CertificateUtils.class)) {
            certUtils
                    .when(() -> CertificateUtils.readCertificate(certResource))
                    .thenReturn(certificate);
            certUtils
                    .when(() -> CertificateUtils.readPrivateKey(keyResource))
                    .thenReturn(privateKey);

            // This should complete without throwing an exception
            customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);
            // Success is verified by no exception being thrown
        }
    }

    @Test
    void testSaml2LogoutFailure_FallsBackToLocalLogout() throws Exception {
        // Test SAML2 logout with exception falls back to local logout
        String registrationId = "test-saml";
        String providerName = "TestIdP";
        String nameIdValue = "user@example.com";
        String localLogoutPath = "/login?logout=true";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        Saml2Authentication authentication = mock(Saml2Authentication.class);
        CustomSaml2AuthenticatedPrincipal principal = mock(CustomSaml2AuthenticatedPrincipal.class);
        ApplicationProperties.Security.SAML2 saml2Config =
                mock(ApplicationProperties.Security.SAML2.class);

        Resource certResource = mock(Resource.class);

        when(response.isCommitted()).thenReturn(false);
        when(response.encodeRedirectURL(anyString())).thenAnswer(i -> i.getArguments()[0]);
        when(request.getContextPath()).thenReturn("");

        when(securityProperties.getSaml2()).thenReturn(saml2Config);
        when(saml2Config.getRegistrationId()).thenReturn(registrationId);
        when(saml2Config.getProvider()).thenReturn(providerName);
        when(saml2Config.getSpCert()).thenReturn(certResource);

        when(authentication.getPrincipal()).thenReturn(principal);
        when(principal.name()).thenReturn(nameIdValue);

        // Simulate exception when reading certificate
        try (MockedStatic<CertificateUtils> certUtils = mockStatic(CertificateUtils.class)) {
            certUtils
                    .when(() -> CertificateUtils.readCertificate(certResource))
                    .thenThrow(new RuntimeException("Failed to read certificate"));

            customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

            // Verify fallback to local logout via redirect strategy
            verify(response).sendRedirect(localLogoutPath);
        }
    }

    @Test
    void testSaml2LogoutWithCertificateError_RedirectsToLocalLogout() throws Exception {
        // Test SAML2 logout with certificate reading error
        String registrationId = "test-saml";
        String providerName = "TestIdP";
        String nameIdValue = "user@example.com";
        String localLogoutPath = "/login?logout=true";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        Saml2Authentication authentication = mock(Saml2Authentication.class);
        CustomSaml2AuthenticatedPrincipal principal = mock(CustomSaml2AuthenticatedPrincipal.class);
        ApplicationProperties.Security.SAML2 saml2Config =
                mock(ApplicationProperties.Security.SAML2.class);

        Resource certResource = mock(Resource.class);

        when(response.isCommitted()).thenReturn(false);
        when(response.encodeRedirectURL(anyString())).thenAnswer(i -> i.getArguments()[0]);
        when(request.getContextPath()).thenReturn("");

        when(securityProperties.getSaml2()).thenReturn(saml2Config);
        when(saml2Config.getRegistrationId()).thenReturn(registrationId);
        when(saml2Config.getProvider()).thenReturn(providerName);
        when(saml2Config.getSpCert()).thenReturn(certResource);

        when(authentication.getPrincipal()).thenReturn(principal);
        when(principal.name()).thenReturn(nameIdValue);

        // Simulate certificate error
        try (MockedStatic<CertificateUtils> certUtils = mockStatic(CertificateUtils.class)) {
            certUtils
                    .when(() -> CertificateUtils.readCertificate(certResource))
                    .thenThrow(
                            new java.security.cert.CertificateException(
                                    "Invalid certificate format"));

            customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

            // Verify fallback to local logout via redirect strategy
            verify(response).sendRedirect(localLogoutPath);
        }
    }

    @Test
    void testSaml2LogoutWithPrivateKeyError_RedirectsToLocalLogout() throws Exception {
        // Test SAML2 logout with private key reading error
        String registrationId = "test-saml";
        String providerName = "TestIdP";
        String nameIdValue = "user@example.com";
        String localLogoutPath = "/login?logout=true";

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        Saml2Authentication authentication = mock(Saml2Authentication.class);
        CustomSaml2AuthenticatedPrincipal principal = mock(CustomSaml2AuthenticatedPrincipal.class);
        ApplicationProperties.Security.SAML2 saml2Config =
                mock(ApplicationProperties.Security.SAML2.class);

        Resource certResource = mock(Resource.class);
        Resource keyResource = mock(Resource.class);
        X509Certificate certificate = mock(X509Certificate.class);

        when(response.isCommitted()).thenReturn(false);
        when(response.encodeRedirectURL(anyString())).thenAnswer(i -> i.getArguments()[0]);
        when(request.getContextPath()).thenReturn("");

        when(securityProperties.getSaml2()).thenReturn(saml2Config);
        when(saml2Config.getRegistrationId()).thenReturn(registrationId);
        when(saml2Config.getProvider()).thenReturn(providerName);
        when(saml2Config.getSpCert()).thenReturn(certResource);
        when(saml2Config.getPrivateKey()).thenReturn(keyResource);
        when(saml2Config.getIdpSingleLogoutUrl()).thenReturn("https://idp.example.com/logout");
        when(saml2Config.getIdpIssuer()).thenReturn("https://idp.example.com");

        when(authentication.getPrincipal()).thenReturn(principal);
        when(principal.name()).thenReturn(nameIdValue);

        when(appConfig.getBaseUrl()).thenReturn("http://localhost");
        when(appConfig.getServerPort()).thenReturn("8080");

        // Certificate reads successfully but private key fails
        try (MockedStatic<CertificateUtils> certUtils = mockStatic(CertificateUtils.class)) {
            certUtils
                    .when(() -> CertificateUtils.readCertificate(certResource))
                    .thenReturn(certificate);
            certUtils
                    .when(() -> CertificateUtils.readPrivateKey(keyResource))
                    .thenThrow(new RuntimeException("Failed to read private key"));

            customLogoutSuccessHandler.onLogoutSuccess(request, response, authentication);

            // Verify fallback to local logout via redirect strategy
            verify(response).sendRedirect(localLogoutPath);
        }
    }
}
