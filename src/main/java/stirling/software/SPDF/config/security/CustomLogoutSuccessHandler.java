package stirling.software.SPDF.config.security;

import java.io.IOException;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPrivateKey;
import java.util.ArrayList;
import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.saml2.provider.service.authentication.Saml2Authentication;
import org.springframework.security.web.authentication.logout.SimpleUrlLogoutSuccessHandler;

import com.coveo.saml.SamlClient;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.SPdfApplication;
import stirling.software.SPDF.config.security.saml2.CertificateUtils;
import stirling.software.SPDF.config.security.saml2.CustomSaml2AuthenticatedPrincipal;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.SPDF.model.ApplicationProperties.Security.SAML2;
import stirling.software.SPDF.model.Provider;
import stirling.software.SPDF.model.provider.UnsupportedProviderException;
import stirling.software.SPDF.utils.UrlUtils;

@Slf4j
@AllArgsConstructor
public class CustomLogoutSuccessHandler extends SimpleUrlLogoutSuccessHandler {

    private final ApplicationProperties applicationProperties;

    @Override
    public void onLogoutSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException, ServletException {

        if (!response.isCommitted()) {
            // Handle user logout due to disabled account
            if (request.getParameter("userIsDisabled") != null) {
                response.sendRedirect(
                        request.getContextPath() + "/login?erroroauth=userIsDisabled");
                return;
            }
            // Handle OAuth2 authentication error
            if (request.getParameter("oauth2AuthenticationErrorWeb") != null) {
                response.sendRedirect(
                        request.getContextPath() + "/login?erroroauth=userAlreadyExistsWeb");
                return;
            }
            if (authentication != null) {
                // Handle SAML2 logout redirection
                if (authentication instanceof Saml2Authentication) {
                    getRedirect_saml2(request, response, authentication);
                    return;
                }
                // Handle OAuth2 logout redirection
                else if (authentication instanceof OAuth2AuthenticationToken) {
                    getRedirect_oauth2(request, response, authentication);
                    return;
                }
                // Handle Username/Password logout
                else if (authentication instanceof UsernamePasswordAuthenticationToken) {
                    getRedirectStrategy().sendRedirect(request, response, "/login?logout=true");
                    return;
                }
                // Handle unknown authentication types
                else {
                    log.error(
                            "authentication class unknown: "
                                    + authentication.getClass().getSimpleName());
                    getRedirectStrategy().sendRedirect(request, response, "/login?logout=true");
                    return;
                }
            } else {
                // Redirect to login page after logout
                getRedirectStrategy().sendRedirect(request, response, "/login?logout=true");
                return;
            }
        }
    }

    // Redirect for SAML2 authentication logout
    private void getRedirect_saml2(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException {

        SAML2 samlConf = applicationProperties.getSecurity().getSaml2();
        String registrationId = samlConf.getRegistrationId();

        Saml2Authentication samlAuthentication = (Saml2Authentication) authentication;
        CustomSaml2AuthenticatedPrincipal principal =
                (CustomSaml2AuthenticatedPrincipal) samlAuthentication.getPrincipal();

        String nameIdValue = principal.getName();

        try {
            // Read certificate from the resource
            Resource certificateResource = samlConf.getSpCert();
            X509Certificate certificate = CertificateUtils.readCertificate(certificateResource);

            List<X509Certificate> certificates = new ArrayList<>();
            certificates.add(certificate);

            // Construct URLs required for SAML configuration
            String serverUrl =
                    SPdfApplication.getStaticBaseUrl() + ":" + SPdfApplication.getStaticPort();

            String relyingPartyIdentifier =
                    serverUrl + "/saml2/service-provider-metadata/" + registrationId;

            String assertionConsumerServiceUrl = serverUrl + "/login/saml2/sso/" + registrationId;

            String idpUrl = samlConf.getIdpSingleLogoutUrl();

            String idpIssuer = samlConf.getIdpIssuer();

            // Create SamlClient instance for SAML logout
            SamlClient samlClient =
                    new SamlClient(
                            relyingPartyIdentifier,
                            assertionConsumerServiceUrl,
                            idpUrl,
                            idpIssuer,
                            certificates,
                            SamlClient.SamlIdpBinding.POST);

            // Read private key for service provider
            Resource privateKeyResource = samlConf.getPrivateKey();
            RSAPrivateKey privateKey = CertificateUtils.readPrivateKey(privateKeyResource);

            // Set service provider keys for the SamlClient
            samlClient.setSPKeys(certificate, privateKey);

            // Redirect to identity provider for logout
            samlClient.redirectToIdentityProvider(response, null, nameIdValue);
        } catch (Exception e) {
            log.error(nameIdValue, e);
            getRedirectStrategy().sendRedirect(request, response, "/login?logout=true");
        }
    }

    // Redirect for OAuth2 authentication logout
    private void getRedirect_oauth2(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException {
        String param = "logout=true";
        String registrationId = null;
        String issuer = null;
        String clientId = null;
        OAUTH2 oauth = applicationProperties.getSecurity().getOauth2();

        if (authentication instanceof OAuth2AuthenticationToken) {
            OAuth2AuthenticationToken oauthToken = (OAuth2AuthenticationToken) authentication;
            registrationId = oauthToken.getAuthorizedClientRegistrationId();

            try {
                // Get OAuth2 provider details from configuration
                Provider provider = oauth.getClient().get(registrationId);
                issuer = provider.getIssuer();
                clientId = provider.getClientId();
            } catch (UnsupportedProviderException e) {
                log.error(e.getMessage());
            }
        } else {
            registrationId = oauth.getProvider() != null ? oauth.getProvider() : "";
            issuer = oauth.getIssuer();
            clientId = oauth.getClientId();
        }
        String errorMessage = "";
        // Handle different error scenarios during logout
        if (request.getParameter("oauth2AuthenticationErrorWeb") != null) {
            param = "erroroauth=oauth2AuthenticationErrorWeb";
        } else if ((errorMessage = request.getParameter("error")) != null) {
            param = "error=" + sanitizeInput(errorMessage);
        } else if ((errorMessage = request.getParameter("erroroauth")) != null) {
            param = "erroroauth=" + sanitizeInput(errorMessage);
        } else if (request.getParameter("oauth2AutoCreateDisabled") != null) {
            param = "error=oauth2AutoCreateDisabled";
        } else if (request.getParameter("oauth2_admin_blocked_user") != null) {
            param = "erroroauth=oauth2_admin_blocked_user";
        } else if (request.getParameter("userIsDisabled") != null) {
            param = "erroroauth=userIsDisabled";
        } else if (request.getParameter("badcredentials") != null) {
            param = "error=badcredentials";
        }

        String redirect_url = UrlUtils.getOrigin(request) + "/login?" + param;

        // Redirect based on OAuth2 provider
        switch (registrationId.toLowerCase()) {
            case "keycloak":
                // Add Keycloak specific logout URL if needed
                String logoutUrl =
                        issuer
                                + "/protocol/openid-connect/logout"
                                + "?client_id="
                                + clientId
                                + "&post_logout_redirect_uri="
                                + response.encodeRedirectURL(redirect_url);
                log.info("Redirecting to Keycloak logout URL: " + logoutUrl);
                response.sendRedirect(logoutUrl);
                break;
            case "github":
                // Add GitHub specific logout URL if needed
                String githubLogoutUrl = "https://github.com/logout";
                log.info("Redirecting to GitHub logout URL: " + githubLogoutUrl);
                response.sendRedirect(githubLogoutUrl);
                break;
            case "google":
                // Add Google specific logout URL if needed
                // String googleLogoutUrl =
                // "https://accounts.google.com/Logout?continue=https://appengine.google.com/_ah/logout?continue="
                //                 + response.encodeRedirectURL(redirect_url);
                log.info("Google does not have a specific logout URL");
                // log.info("Redirecting to Google logout URL: " + googleLogoutUrl);
                // response.sendRedirect(googleLogoutUrl);
                // break;
            default:
                String defaultRedirectUrl = request.getContextPath() + "/login?" + param;
                log.info("Redirecting to default logout URL: " + defaultRedirectUrl);
                response.sendRedirect(defaultRedirectUrl);
                break;
        }
    }

    // Sanitize input to avoid potential security vulnerabilities
    private String sanitizeInput(String input) {
        return input.replaceAll("[^a-zA-Z0-9 ]", "");
    }
}
