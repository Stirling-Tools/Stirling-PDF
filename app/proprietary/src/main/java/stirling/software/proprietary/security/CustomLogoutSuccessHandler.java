package stirling.software.proprietary.security;

import java.io.IOException;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPrivateKey;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.core.io.Resource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.saml2.provider.service.authentication.Saml2Authentication;
import org.springframework.security.web.authentication.logout.SimpleUrlLogoutSuccessHandler;
import org.springframework.web.client.RestClient;

import com.coveo.saml.SamlClient;
import com.coveo.saml.SamlException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.AppConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.common.model.ApplicationProperties.Security.SAML2;
import stirling.software.common.model.oauth2.KeycloakProvider;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.UrlUtils;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.security.saml2.CertificateUtils;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;
import stirling.software.proprietary.security.service.JwtServiceInterface;

@Slf4j
@RequiredArgsConstructor
public class CustomLogoutSuccessHandler extends SimpleUrlLogoutSuccessHandler {

    public static final String LOGOUT_PATH = "/login?logout=true";

    private static final Map<String, String> endSessionEndpointCache = new ConcurrentHashMap<>();

    private final ApplicationProperties.Security securityProperties;

    private final AppConfig appConfig;

    private final JwtServiceInterface jwtService;

    @Override
    @Audited(type = AuditEventType.USER_LOGOUT, level = AuditLevel.BASIC)
    public void onLogoutSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException {

        if (!response.isCommitted()) {
            if (authentication != null) {
                // Check for JWT-based authentication and extract authType claim
                String authType = null;
                if (authentication instanceof JwtAuthenticationToken jwtAuth) {
                    authType =
                            (String)
                                    jwtAuth.getToken()
                                            .getClaims()
                                            .getOrDefault("authType", null);
                    log.debug("JWT-based logout detected with authType: {}", authType);
                }

                if ("SAML2".equals(authType)) {
                    // Handle SAML2 logout redirection
                    if (authentication instanceof Saml2Authentication samlAuthentication) {
                        getRedirect_saml2(request, response, samlAuthentication);
                    } else {
                        log.info("SAML2 logout via JWT - redirecting to login page");
                        getRedirectStrategy().sendRedirect(request, response, LOGOUT_PATH);
                    }
                } else if ("OAUTH2".equals(authType)) {
                    if (authentication instanceof OAuth2AuthenticationToken oAuthToken) {
                        getRedirect_oauth2(request, response, oAuthToken);
                    } else {
                        log.info("OAuth2 logout via JWT - attempting OIDC logout");
                        handleJwtOAuth2Logout(request, response);
                    }
                } else if (authentication instanceof UsernamePasswordAuthenticationToken
                        || authentication instanceof JwtAuthenticationToken) {
                    // Handle Username/Password logout (or JWT without OAUTH2/SAML2 authType)
                    getRedirectStrategy().sendRedirect(request, response, LOGOUT_PATH);
                } else {
                    // Handle unknown authentication types
                    log.error(
                            "Authentication class unknown: {}",
                            authentication.getClass().getSimpleName());
                    getRedirectStrategy().sendRedirect(request, response, LOGOUT_PATH);
                }
            } else {
                if (jwtService != null) {
                    String token = jwtService.extractToken(request);
                    if (token != null && !token.isBlank()) {
                        getRedirectStrategy().sendRedirect(request, response, LOGOUT_PATH);
                        return;
                    }
                }
                // Redirect to login page after logout
                String path = checkForErrors(request);
                getRedirectStrategy().sendRedirect(request, response, path);
            }
        }
    }

    // Redirect for SAML2 authentication logout
    private void getRedirect_saml2(
            HttpServletRequest request,
            HttpServletResponse response,
            Saml2Authentication samlAuthentication)
            throws IOException {

        SAML2 samlConf = securityProperties.getSaml2();
        String registrationId = samlConf.getRegistrationId();

        CustomSaml2AuthenticatedPrincipal principal =
                (CustomSaml2AuthenticatedPrincipal) samlAuthentication.getPrincipal();

        String nameIdValue = principal.name();

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
            getRedirectStrategy().sendRedirect(request, response, LOGOUT_PATH);
        }
    }

    // Redirect for OAuth2 authentication logout
    private void getRedirect_oauth2(
            HttpServletRequest request,
            HttpServletResponse response,
            OAuth2AuthenticationToken oAuthToken)
            throws IOException {
        String registrationId;
        OAUTH2 oauth = securityProperties.getOauth2();
        String path = checkForErrors(request);

        String redirectUrl = UrlUtils.getOrigin(request) + "/login?" + path;
        registrationId = oAuthToken.getAuthorizedClientRegistrationId();

        // Redirect based on OAuth2 provider
        switch (registrationId.toLowerCase()) {
            case "github", "google" -> {
                // These providers don't support OIDC logout
                log.info(
                        "No logout URL for {} available. Redirecting to local logout: {}",
                        registrationId,
                        redirectUrl);
                response.sendRedirect(redirectUrl);
            }
            default -> handleOidcLogout(response, oAuthToken, oauth, redirectUrl);
        }
    }

    // Redirect for JWT-based OAuth2 authentication logout
    private void handleJwtOAuth2Logout(HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        OAUTH2 oauth = securityProperties.getOauth2();
        String path = checkForErrors(request);
        String redirectUrl = UrlUtils.getOrigin(request) + "/login?" + path;

        // For JWT-based auth, we don't have OAuth2AuthenticationToken
        // Attempt generic OIDC logout
        String issuer = null;
        String clientId = null;

        if (oauth.getClient() != null && oauth.getClient().getKeycloak() != null) {
            KeycloakProvider keycloak = oauth.getClient().getKeycloak();
            if (keycloak.getIssuer() != null && !keycloak.getIssuer().isBlank()) {
                issuer = keycloak.getIssuer();
                clientId = keycloak.getClientId();
            } else if (oauth.getIssuer() != null && !oauth.getIssuer().isBlank()) {
                issuer = oauth.getIssuer();
                clientId = oauth.getClientId();
            }
        } else if (oauth.getIssuer() != null && !oauth.getIssuer().isBlank()) {
            issuer = oauth.getIssuer();
            clientId = oauth.getClientId();
        }

        String endSessionEndpoint = getEndSessionEndpoint(oauth, issuer);

        // If no endpoint found, try Keycloak fallback
        if (endSessionEndpoint == null && issuer != null) {
            endSessionEndpoint = issuer + "/protocol/openid-connect/logout";
            log.debug("Using Keycloak fallback logout path: {}", endSessionEndpoint);
        }

        // If we have an endpoint, construct the logout URL
        if (endSessionEndpoint != null) {
            StringBuilder logoutUrlBuilder = new StringBuilder(endSessionEndpoint);
            logoutUrlBuilder.append(endSessionEndpoint.contains("?") ? "&" : "?");

            // Without OAuth2AuthenticationToken, we don't have id_token_hint
            // Just use client_id and post_logout_redirect_uri
            if (clientId != null && !clientId.isBlank()) {
                logoutUrlBuilder.append("client_id=").append(clientId);
                logoutUrlBuilder.append("&");
            }
            logoutUrlBuilder
                    .append("post_logout_redirect_uri=")
                    .append(response.encodeRedirectURL(redirectUrl));

            String logoutUrl = logoutUrlBuilder.toString();
            log.info("JWT-based OAuth2 logout URL: {}", logoutUrl);
            response.sendRedirect(logoutUrl);
        } else {
            // No OIDC logout endpoint available - fallback to local logout
            log.info(
                    "No OIDC logout endpoint available for issuer: {}. Using local logout: {}",
                    issuer,
                    redirectUrl);
            response.sendRedirect(redirectUrl);
        }
    }

    /**
     * Handles OIDC logout with hybrid endpoint discovery Tries: 1. Configured endpoint 2.
     * Discovered endpoint 3. Keycloak fallback (if isKeycloak=true) 4. Local logout
     */
    private void handleOidcLogout(
            HttpServletResponse response,
            OAuth2AuthenticationToken oAuthToken,
            OAUTH2 oauth,
            String redirectUrl)
            throws IOException {

        String issuer = null;
        String clientId = null;

        boolean isKeycloak =
                "keycloak".equalsIgnoreCase(oAuthToken.getAuthorizedClientRegistrationId());
        if (isKeycloak) {
            KeycloakProvider keycloak = oauth.getClient().getKeycloak();
            if (keycloak.getIssuer() != null && !keycloak.getIssuer().isBlank()) {
                issuer = keycloak.getIssuer();
                clientId = keycloak.getClientId();
            } else if (oauth.getIssuer() != null && !oauth.getIssuer().isBlank()) {
                issuer = oauth.getIssuer();
                clientId = oauth.getClientId();
            }
        } else if (oauth.getIssuer() != null && !oauth.getIssuer().isBlank()) {
            issuer = oauth.getIssuer();
            clientId = oauth.getClientId();
        }

        String endSessionEndpoint = getEndSessionEndpoint(oauth, issuer);

        // If no endpoint found and this is Keycloak, try the hardcoded path
        if (endSessionEndpoint == null && isKeycloak && issuer != null) {
            endSessionEndpoint = issuer + "/protocol/openid-connect/logout";
            log.debug("Using Keycloak fallback logout path: {}", endSessionEndpoint);
        }

        // If we have an endpoint, construct the logout URL
        if (endSessionEndpoint != null) {
            StringBuilder logoutUrlBuilder = new StringBuilder(endSessionEndpoint);

            // Extract id_token_hint if available (OIDC)
            Object principal = oAuthToken.getPrincipal();
            if (principal instanceof OidcUser oidcUser) {
                String idToken = oidcUser.getIdToken().getTokenValue();
                logoutUrlBuilder.append(
                        endSessionEndpoint.contains("?") ? "&" : "?"); // Handle existing params
                logoutUrlBuilder.append("id_token_hint=").append(idToken);
                logoutUrlBuilder
                        .append("&post_logout_redirect_uri=")
                        .append(response.encodeRedirectURL(redirectUrl));

                // client_id is optional when id_token_hint is present, but included for
                // compatibility
                if (clientId != null && !clientId.isBlank()) {
                    logoutUrlBuilder.append("&client_id=").append(clientId);
                }

                log.info("OIDC logout with id_token_hint (session-aware): {}", endSessionEndpoint);
            } else {
                // Fallback to client_id only (less ideal, may show confirmation screen)
                logoutUrlBuilder.append(endSessionEndpoint.contains("?") ? "&" : "?");
                if (clientId != null && !clientId.isBlank()) {
                    logoutUrlBuilder.append("client_id=").append(clientId);
                    logoutUrlBuilder.append("&");
                }
                logoutUrlBuilder
                        .append("post_logout_redirect_uri=")
                        .append(response.encodeRedirectURL(redirectUrl));

                log.warn("OIDC logout without id_token_hint - user may see confirmation screen");
            }

            String logoutUrl = logoutUrlBuilder.toString();
            log.debug("OIDC logout URL: {}", logoutUrl);
            response.sendRedirect(logoutUrl);
        } else {
            // No OIDC logout endpoint available - fallback to local logout
            log.info(
                    "No OIDC logout endpoint available for issuer: {}. Using local logout: {}",
                    issuer,
                    redirectUrl);
            response.sendRedirect(redirectUrl);
        }
    }

    private SamlClient getSamlClient(
            String registrationId, SAML2 samlConf, List<X509Certificate> certificates)
            throws SamlException {
        String serverUrl = appConfig.getBaseUrl() + ":" + appConfig.getServerPort();

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
        String path = "?logout=true";

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

    /**
     * Discovers the OIDC end_session_endpoint from the provider's .well-known/openid-configuration
     * Uses a cache to avoid repeated HTTP calls
     *
     * @param issuer The OIDC issuer URL
     * @return The end_session_endpoint URL, or null if not found/supported
     */
    private String discoverEndSessionEndpoint(String issuer) {
        // Check cache first
        if (endSessionEndpointCache.containsKey(issuer)) {
            return endSessionEndpointCache.get(issuer);
        }

        try {
            // Construct discovery URL
            String discoveryUrl = issuer;
            if (!discoveryUrl.endsWith("/")) {
                discoveryUrl += "/";
            }
            discoveryUrl += ".well-known/openid-configuration";

            log.debug("Discovering OIDC endpoints from: {}", discoveryUrl);

            // Make HTTP request with timeout using Spring's RestClient
            RestClient restClient =
                    RestClient.builder()
                            .baseUrl(discoveryUrl)
                            .defaultHeaders(
                                    headers -> {
                                        headers.set("Accept", "application/json");
                                    })
                            .build();

            // Fetch and parse OIDC discovery document
            Map<String, Object> discoveryDoc =
                    restClient
                            .get()
                            .retrieve()
                            .onStatus(
                                    status -> !status.is2xxSuccessful(),
                                    (request, response) ->
                                            log.warn(
                                                    "Failed to discover OIDC endpoints for {}: HTTP {}",
                                                    issuer,
                                                    response.getStatusCode().value()))
                            .body(Map.class);

            if (discoveryDoc != null && discoveryDoc.containsKey("end_session_endpoint")) {
                String endpoint = (String) discoveryDoc.get("end_session_endpoint");
                if (endpoint != null && !endpoint.isBlank()) {
                    log.info("Discovered end_session_endpoint for {}: {}", issuer, endpoint);
                    // Cache the result
                    endSessionEndpointCache.put(issuer, endpoint);
                    return endpoint;
                }
            }

            log.info(
                    "Provider {} does not advertise end_session_endpoint in OIDC discovery",
                    issuer);
            // Cache null result to avoid repeated failed attempts
            endSessionEndpointCache.put(issuer, null);
            return null;

        } catch (Exception e) {
            log.warn("Error discovering end_session_endpoint for {}: {}", issuer, e.getMessage());
            return null;
        }
    }

    /**
     * Gets the OIDC end_session_endpoint from: 1. Configuration first 2. Fall back to discovery 3.
     * Return null if not available
     *
     * @param oauth The OAuth2 configuration
     * @param issuer The OIDC issuer URL
     * @return The end_session_endpoint URL, or null if not available
     */
    private String getEndSessionEndpoint(
            ApplicationProperties.Security.OAUTH2 oauth, String issuer) {
        if (oauth != null && oauth.getClient() != null) {
            String configuredEndpoint = oauth.getClient().getEndSessionEndpoint();
            if (configuredEndpoint != null && !configuredEndpoint.isBlank()) {
                log.debug("Using configured end_session_endpoint: {}", configuredEndpoint);
                return configuredEndpoint;
            }
        }

        if (issuer != null && !issuer.isBlank()) {
            return discoverEndSessionEndpoint(issuer);
        }

        return null;
    }
}
