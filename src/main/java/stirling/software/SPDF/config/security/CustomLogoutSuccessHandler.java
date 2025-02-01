package stirling.software.SPDF.config.security;

import java.io.IOException;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPrivateKey;
import java.util.ArrayList;
import java.util.List;

import org.apache.commons.lang3.StringUtils;
import org.springframework.core.io.Resource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.saml2.provider.service.authentication.Saml2Authentication;
import org.springframework.security.web.authentication.logout.SimpleUrlLogoutSuccessHandler;

import com.coveo.saml.SamlClient;
import com.coveo.saml.SamlException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.SPDFApplication;
import stirling.software.SPDF.config.security.saml2.CertificateUtils;
import stirling.software.SPDF.config.security.saml2.CustomSaml2AuthenticatedPrincipal;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.SPDF.model.ApplicationProperties.Security.SAML2;
import stirling.software.SPDF.utils.UrlUtils;

@Slf4j
@AllArgsConstructor
public class CustomLogoutSuccessHandler extends SimpleUrlLogoutSuccessHandler {

    public static final String LOGOUT_PATH = "/login?logout=true";

    private final ApplicationProperties applicationProperties;

    @Override
    public void onLogoutSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException {
        if (!response.isCommitted()) {
            if (authentication != null) {
                if (authentication instanceof Saml2Authentication) {
                    // Handle SAML2 logout redirection
                    getRedirect_saml2(request, response, authentication);
                } else if (authentication instanceof OAuth2AuthenticationToken) {
                    // Handle OAuth2 logout redirection
                    getRedirect_oauth2(request, response, authentication);
                } else if (authentication instanceof UsernamePasswordAuthenticationToken) {
                    // Handle Username/Password logout
                    getRedirectStrategy().sendRedirect(request, response, LOGOUT_PATH);
                } else {
                    // Handle unknown authentication types
                    log.error(
                            "Authentication class unknown: {}",
                            authentication.getClass().getSimpleName());
                    getRedirectStrategy().sendRedirect(request, response, LOGOUT_PATH);
                }
            } else {
                // Redirect to login page after logout
                getRedirectStrategy().sendRedirect(request, response, LOGOUT_PATH);
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
            SamlClient samlClient = getSamlClient(registrationId, samlConf, certificates);

            // Read private key for service provider
            Resource privateKeyResource = samlConf.getPrivateKey();
            RSAPrivateKey privateKey = CertificateUtils.readPrivateKey(privateKeyResource);

            // Set service provider keys for the SamlClient
            samlClient.setSPKeys(certificate, privateKey);

            // Redirect to identity provider for logout
            samlClient.redirectToIdentityProvider(response, null, nameIdValue);
        } catch (Exception e) {
            log.error(nameIdValue, e);
            getRedirectStrategy().sendRedirect(request, response, LOGOUT_PATH);
        }
    }

    private void getRedirect_oauth2(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException {
        String registrationId;
        OAUTH2 oauth = applicationProperties.getSecurity().getOauth2();
        String path = checkForErrors(request);

        if (authentication instanceof OAuth2AuthenticationToken oauthToken) {
            registrationId = oauthToken.getAuthorizedClientRegistrationId();
        } else {
            registrationId = oauth.getProvider() != null ? oauth.getProvider() : "";
        }

        String redirectUrl = UrlUtils.getOrigin(request) + "/login?" + path;

        // Redirect based on OAuth2 provider
        switch (registrationId.toLowerCase()) {
            case "keycloak" -> {
                String logoutUrl =
                        oauth.getIssuer()
                                + "/protocol/openid-connect/logout"
                                + "?client_id="
                                + oauth.getClientId()
                                + "&post_logout_redirect_uri="
                                + response.encodeRedirectURL(redirectUrl);
                log.info("Redirecting to Keycloak logout URL: {}", logoutUrl);
                response.sendRedirect(logoutUrl);
            }
            case "github", "google" -> {
                log.info(
                        "No redirect URL for {} available. Redirecting to default logout URL: {}",
                        registrationId,
                        redirectUrl);
                response.sendRedirect(redirectUrl);
            }
            default -> {
                String logoutUrl = oauth.getLogoutUrl();

                if (StringUtils.isNotBlank(logoutUrl)) {
                    log.info("Redirecting to logout URL: {}", logoutUrl);
                    response.sendRedirect(logoutUrl);
                } else {
                    log.info("Redirecting to default logout URL: {}", redirectUrl);
                    response.sendRedirect(redirectUrl);
                }
            }
        }
    }

    // Redirect for OAuth2 authentication logout
    private static SamlClient getSamlClient(
            String registrationId, SAML2 samlConf, List<X509Certificate> certificates)
            throws SamlException {
        String serverUrl =
                SPDFApplication.getStaticBaseUrl() + ":" + SPDFApplication.getStaticPort();

        String relyingPartyIdentifier =
                serverUrl + "/saml2/service-provider-metadata/" + registrationId;

        String assertionConsumerServiceUrl = serverUrl + "/login/saml2/sso/" + registrationId;

        String idpUrl = samlConf.getIdpSingleLogoutUrl();

        String idpIssuer = samlConf.getIdpIssuer();

        // Create SamlClient instance for SAML logout
        return new SamlClient(
                relyingPartyIdentifier,
                assertionConsumerServiceUrl,
                idpUrl,
                idpIssuer,
                certificates,
                SamlClient.SamlIdpBinding.POST);
    }

    /**
     * Handles different error scenarios during logout. Will return a <code>String</code> containing
     * the error request parameter.
     *
     * @param request the user's <code>HttpServletRequest</code> request.
     * @return a <code>String</code> containing the error request parameter.
     */
    private String checkForErrors(HttpServletRequest request) {
        String errorMessage;
        String path = "logout=true";

        if (request.getParameter("oAuth2AuthenticationErrorWeb") != null) {
            path = "errorOAuth=userAlreadyExistsWeb";
        } else if ((errorMessage = request.getParameter("errorOAuth")) != null) {
            path = "errorOAuth=" + sanitizeInput(errorMessage);
        } else if (request.getParameter("oAuth2AutoCreateDisabled") != null) {
            path = "errorOAuth=oAuth2AutoCreateDisabled";
        } else if (request.getParameter("oAuth2AdminBlockedUser") != null) {
            path = "errorOAuth=oAuth2AdminBlockedUser";
        } else if (request.getParameter("userIsDisabled") != null) {
            path = "errorOAuth=userIsDisabled";
        } else if ((errorMessage = request.getParameter("error")) != null) {
            path = "errorOAuth=" + sanitizeInput(errorMessage);
        } else if (request.getParameter("badCredentials") != null) {
            path = "errorOAuth=badCredentials";
        }

        return path;
    }

    /**
     * Sanitize input to avoid potential security vulnerabilities. Will return a sanitised <code>
     * String</code>.
     *
     * @return a sanitised <code>String</code>
     */
    private String sanitizeInput(String input) {
        return input.replaceAll("[^a-zA-Z0-9 ]", "");
    }
}
