package stirling.software.proprietary.security;

import java.io.IOException;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPrivateKey;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import com.coveo.saml.SamlClient;
import com.coveo.saml.SamlException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.AppConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.common.model.ApplicationProperties.Security.SAML2;
import stirling.software.common.model.io.Resource;
import stirling.software.common.model.oauth2.KeycloakProvider;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.UrlUtils;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.security.saml2.CertificateUtils;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.service.AiUserDataService;

// TODO: Migration required - this class was a Spring Security
// SimpleUrlLogoutSuccessHandler wired into the Spring Security logout filter chain.
// Quarkus has no LogoutSuccessHandler equivalent. The logout endpoint must be rehosted
// (e.g. a JAX-RS resource or jakarta.servlet endpoint) that invokes onLogoutSuccess(...)
// after the Quarkus security/session logout has run. Configure HTTP auth/logout policies
// via quarkus.http.auth.* and quarkus-oidc (for OAuth2/OIDC logout).
@Slf4j
@ApplicationScoped
@RequiredArgsConstructor(onConstructor_ = @Inject)
public class CustomLogoutSuccessHandler {

    public static final String LOGOUT_PATH = "/login?logout=true";

    private final ApplicationProperties.Security securityProperties;

    private final AppConfig appConfig;

    private final JwtServiceInterface jwtService;

    private final AiUserDataService aiUserDataService;

    // TODO: Migration required - Spring's AuthenticationTrustResolver
    // (used to filter out the anonymous principal) has no direct Quarkus equivalent.
    // Under Quarkus, an unauthenticated request yields an anonymous SecurityIdentity
    // (SecurityIdentity#isAnonymous()); use that check in resolveUsername(...) instead.

    @Audited(type = AuditEventType.USER_LOGOUT, level = AuditLevel.BASIC)
    public void onLogoutSuccess(
            HttpServletRequest request, HttpServletResponse response, Object authentication)
            throws IOException {

        String username = resolveUsername(request, authentication);
        if (username != null) {
            aiUserDataService.purgeUserDocuments(username);
        }

        if (!response.isCommitted()) {
            if (authentication != null) {
                // TODO: Migration required - the original code branched on the Spring
                // Authentication implementation type to choose a logout redirect:
                //   Saml2Authentication            -> getRedirect_saml2(...)
                //   OAuth2AuthenticationToken      -> getRedirect_oauth2(...)
                //   UsernamePasswordAuthentication -> redirect to LOGOUT_PATH
                //   unknown                        -> log + redirect to LOGOUT_PATH
                // Under Quarkus the authentication mechanism is identified differently
                // (SecurityIdentity attributes / quarkus-oidc vs form auth, or the IdP
                // recorded at login). Re-wire this dispatch to invoke getRedirect_saml2 /
                // getRedirect_oauth2 once the Quarkus identity model is in place. Until
                // then we fall through to the default login-page redirect to preserve
                // safe behavior (a single redirect, never IdP logout with a null subject).
                response.sendRedirect(LOGOUT_PATH);
            } else {
                if (jwtService != null) {
                    String token = jwtService.extractToken(request);
                    if (token != null && !token.isBlank()) {
                        response.sendRedirect(LOGOUT_PATH);
                        return;
                    }
                }
                // Redirect to login page after logout
                String path = checkForErrors(request);
                response.sendRedirect(path);
            }
        }
    }

    /**
     * Pick the right name to purge under. JWT cookie wins if present and parseable; we fall through
     * to whatever the authentication handed us only when there's no cookie. The anonymous principal
     * is filtered out so we don't purge under that pseudo-user.
     */
    private String resolveUsername(HttpServletRequest request, Object authentication) {
        if (jwtService != null) {
            String fromCookie = jwtService.extractUsernameFromRequestAllowExpired(request);
            if (fromCookie != null) {
                return fromCookie;
            }
        }
        // TODO: Migration required - replace the Spring AuthenticationTrustResolver
        // anonymous check and Authentication#getName() with SecurityIdentity:
        //   if (identity == null || identity.isAnonymous()) return null;
        //   String name = identity.getPrincipal().getName();
        if (authentication == null) {
            return null;
        }
        return null;
    }

    // Redirect for SAML2 authentication logout
    // TODO: Migration required - parameter was Spring Saml2Authentication; the SAML2
    // principal (CustomSaml2AuthenticatedPrincipal) must be recovered from the Quarkus
    // identity once the SAML SP is rehosted on OpenSAML 5 (see SAML2 migration plan).
    private void getRedirect_saml2(
            HttpServletRequest request, HttpServletResponse response, Object samlAuthentication)
            throws IOException {

        SAML2 samlConf = securityProperties.getSaml2();
        String registrationId = samlConf.getRegistrationId();

        // TODO: Migration required - extract the SAML NameID from the Quarkus identity.
        // Original:
        //   CustomSaml2AuthenticatedPrincipal principal =
        //       (CustomSaml2AuthenticatedPrincipal) samlAuthentication.getPrincipal();
        //   String nameIdValue = principal.name();
        String nameIdValue = null;

        try {
            // Read certificate from the resource
            Resource certificateResource = samlConf.getSpCert();
            // TODO: Migration required - CertificateUtils still declares
            // org.springframework.core.io.Resource parameters; once it is migrated to
            // stirling.software.common.model.io.Resource these calls compile directly.
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

            // Build relay state to return user to login page after IdP logout
            String relayState =
                    UrlUtils.getOrigin(request) + request.getContextPath() + LOGOUT_PATH;

            // Redirect to identity provider for logout with relay state
            samlClient.redirectToIdentityProvider(response, relayState, nameIdValue);
        } catch (Exception e) {
            log.error(
                    "Error retrieving logout URL from Provider {} for user {}",
                    samlConf.getProvider(),
                    nameIdValue,
                    e);
            response.sendRedirect(LOGOUT_PATH);
        }
    }

    // Redirect for OAuth2 authentication logout
    // TODO: Migration required - parameter was Spring OAuth2AuthenticationToken; under
    // quarkus-oidc the authorized client registration id must be obtained from the OIDC
    // configuration / SecurityIdentity rather than the token.
    private void getRedirect_oauth2(
            HttpServletRequest request, HttpServletResponse response, Object oAuthToken)
            throws IOException {
        String registrationId;
        OAUTH2 oauth = securityProperties.getOauth2();
        String path = checkForErrors(request);

        String redirectUrl = UrlUtils.getOrigin(request) + "/login?" + path;
        // TODO: Migration required - original:
        //   registrationId = oAuthToken.getAuthorizedClientRegistrationId();
        // Resolve the OIDC provider id from quarkus-oidc config / SecurityIdentity instead.
        registrationId = "";

        // Redirect based on OAuth2 provider
        switch (registrationId.toLowerCase(Locale.ROOT)) {
            case "keycloak" -> {
                KeycloakProvider keycloak = oauth.getClient().getKeycloak();

                boolean isKeycloak = !keycloak.getIssuer().isBlank();
                boolean isCustomOAuth = !oauth.getIssuer().isBlank();

                String logoutUrl = redirectUrl;

                if (isKeycloak) {
                    logoutUrl = keycloak.getIssuer();
                } else if (isCustomOAuth) {
                    logoutUrl = oauth.getIssuer();
                }
                if (isKeycloak || isCustomOAuth) {
                    logoutUrl +=
                            "/protocol/openid-connect/logout"
                                    + "?client_id="
                                    + oauth.getClientId()
                                    + "&post_logout_redirect_uri="
                                    + response.encodeRedirectURL(redirectUrl);
                    log.info("Redirecting to Keycloak logout URL: {}", logoutUrl);
                } else {
                    log.info(
                            "No redirect URL for {} available. Redirecting to default logout URL:"
                                    + " {}",
                            registrationId,
                            logoutUrl);
                }
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
                log.info("Redirecting to default logout URL: {}", redirectUrl);
                response.sendRedirect(redirectUrl);
            }
        }
    }

    private SamlClient getSamlClient(
            String registrationId, SAML2 samlConf, List<X509Certificate> certificates)
            throws SamlException {
        String serverUrl = appConfig.getBackendUrl() + ":" + appConfig.getServerPort();

        String relyingPartyIdentifier =
                serverUrl + "/saml2/service-provider-metadata/" + registrationId;

        String assertionConsumerServiceUrl = serverUrl + "/login/saml2/sso/" + registrationId;

        String idpSLOUrl = samlConf.getIdpSingleLogoutUrl();

        String idpIssuer = samlConf.getIdpIssuer();

        // Create SamlClient instance for SAML logout
        return new SamlClient(
                relyingPartyIdentifier,
                assertionConsumerServiceUrl,
                idpSLOUrl,
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
        } else if (request.getParameter("oAuth2RequiresLicense") != null) {
            path = "errorOAuth=oAuth2RequiresLicense";
        } else if (request.getParameter("saml2RequiresLicense") != null) {
            path = "errorOAuth=saml2RequiresLicense";
        } else if (request.getParameter("maxUsersReached") != null) {
            path = "errorOAuth=maxUsersReached";
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
        return RegexPatternUtils.getInstance()
                .getInputSanitizePattern()
                .matcher(input)
                .replaceAll("");
    }
}
