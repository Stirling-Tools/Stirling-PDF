package stirling.software.proprietary.security;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.saml2.provider.service.authentication.Saml2Authentication;
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;
import org.springframework.security.web.authentication.logout.SimpleUrlLogoutSuccessHandler;
import org.springframework.web.client.RestClient;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.common.model.oauth2.KeycloakProvider;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.UrlUtils;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;
import stirling.software.proprietary.security.service.JwtServiceInterface;

@Slf4j
public class CustomLogoutSuccessHandler extends SimpleUrlLogoutSuccessHandler {

    public static final String LOGOUT_PATH = "/login?logout=true";
    public static final String KEYCLOAK_LOGOUT_PATH = "/protocol/openid-connect/logout";
    private static final Map<String, String> endSessionEndpointCache = new ConcurrentHashMap<>();

    private final ApplicationProperties.Security securityProperties;
    private final JwtServiceInterface jwtService;
    private final LogoutSuccessHandler samlLogoutHandler;

    public CustomLogoutSuccessHandler(
            ApplicationProperties.Security securityProperties, JwtServiceInterface jwtService) {
        this(securityProperties, jwtService, null);
    }

    public CustomLogoutSuccessHandler(
            ApplicationProperties.Security securityProperties,
            JwtServiceInterface jwtService,
            LogoutSuccessHandler samlLogoutHandler) {
        this.securityProperties = securityProperties;
        this.jwtService = jwtService;
        this.samlLogoutHandler = samlLogoutHandler;
    }

    @Override
    @Audited(type = AuditEventType.USER_LOGOUT, level = AuditLevel.BASIC)
    public void onLogoutSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException {

        if (!response.isCommitted()) {
            if (handleSamlLogout(request, response, authentication)) {
                return;
            }

            if (authentication != null) {
                if (authentication instanceof OAuth2AuthenticationToken oAuthToken) {
                    // Handle OAuth2 logout redirection
                    getRedirectOauth2(request, response, oAuthToken);
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
                // Redirect to login page after logout (handles error parameters if present)
                String queryParams = checkForErrors(request);
                getRedirectStrategy().sendRedirect(request, response, "/login?" + queryParams);
            }
        }
    }

    /**
     * Handles SAML logout - either via IdP Single Logout (SLO) or local logout.
     *
     * @return true if this was a SAML user and logout was handled, false otherwise
     */
    private boolean handleSamlLogout(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException {
        // Logout locally if this is a SAMLResponse from to /logout instead of /logout/saml2/slo
        String samlResponse = request.getParameter("SAMLResponse");
        if (samlResponse != null && !samlResponse.isBlank()) {
            if (samlResponse.contains("/saml2/slo")) {
                log.info(
                        "Received SAML LogoutResponse at /logout endpoint, completing logout locally");
                getRedirectStrategy().sendRedirect(request, response, LOGOUT_PATH);
                return true;
            }
        }

        if (securityProperties.getSaml2().getEnableSingleLogout()) {
            log.info("SP-initiated SLO detected, logging out via IdP");

            if (authentication instanceof Saml2Authentication samlAuthentication) {
                if (samlLogoutHandler != null) {
                    try {
                        samlLogoutHandler.onLogoutSuccess(request, response, samlAuthentication);
                    } catch (Exception e) {
                        log.error("SP-initiated SLO failed, falling back to local logout", e);
                        getRedirectStrategy().sendRedirect(request, response, LOGOUT_PATH);
                    }
                } else {
                    log.warn(
                            "SAML SLO enabled but handler not configured, performing local logout only");
                    getRedirectStrategy().sendRedirect(request, response, LOGOUT_PATH);
                }

                return true;
            } else {
                // Reconstruct Saml2Authentication from JWT claims for SLO
                Optional<Saml2Authentication> reconstructedAuth =
                        reconstructSaml2AuthenticationFromJwt(request);

                if (reconstructedAuth.isPresent()) {
                    Saml2Authentication samlAuth = reconstructedAuth.get();

                    if (samlLogoutHandler != null) {
                        try {
                            samlLogoutHandler.onLogoutSuccess(request, response, samlAuth);
                        } catch (Exception e) {
                            log.error("SP-initiated SLO failed, falling back to local logout", e);
                            getRedirectStrategy().sendRedirect(request, response, LOGOUT_PATH);
                        }
                    } else {
                        log.warn(
                                "SAML SLO enabled but handler not configured, performing local logout only");
                        getRedirectStrategy().sendRedirect(request, response, LOGOUT_PATH);
                    }

                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Reconstructs a Saml2Authentication from JWT claims for SAML Single Logout. This allows SLO to
     * work even with stateless JWT sessions by extracting the SAML attributes that were stored in
     * the JWT during initial authentication.
     */
    @SuppressWarnings("unchecked")
    private Optional<Saml2Authentication> reconstructSaml2AuthenticationFromJwt(
            HttpServletRequest request) {
        try {
            String token = jwtService.extractToken(request);
            if (token == null || token.isBlank()) {
                return Optional.empty();
            }

            Map<String, Object> claims = jwtService.extractClaims(token);
            Object authType = claims.get("authType");

            if (authType == null || !"SAML2".equalsIgnoreCase(authType.toString())) {
                return Optional.empty();
            }

            // Extract SAML claims from JWT
            String username = (String) claims.get("sub");
            String nameId = (String) claims.get("samlNameId");
            String registrationId = (String) claims.get("samlRegistrationId");
            Object sessionIndexesObj = claims.get("samlSessionIndexes");

            if (nameId == null || registrationId == null) {
                log.debug(
                        "Missing required SAML claims for SLO reconstruction: nameId={}, registrationId={}",
                        nameId,
                        registrationId);
                return Optional.empty();
            }

            List<String> sessionIndexes = Collections.emptyList();
            if (sessionIndexesObj instanceof List<?>) {
                sessionIndexes =
                        ((List<?>) sessionIndexesObj).stream().map(Object::toString).toList();
            }

            // Create principal with all SAML attributes needed for SLO
            CustomSaml2AuthenticatedPrincipal principal =
                    new CustomSaml2AuthenticatedPrincipal(
                            username,
                            Collections.emptyMap(), // Attributes not needed for logout
                            nameId,
                            sessionIndexes,
                            registrationId);

            // Create Saml2Authentication with the reconstructed principal
            // The saml2Response parameter is not used by the logout handler, but constructor
            // requires non-empty value, so we provide a placeholder
            Saml2Authentication samlAuth =
                    new Saml2Authentication(
                            principal,
                            "<!-- reconstructed for logout -->",
                            Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER")));

            log.debug(
                    "Reconstructed Saml2Authentication from JWT for user {} with registrationId {}",
                    username,
                    registrationId);
            return Optional.of(samlAuth);

        } catch (Exception ex) {
            log.error("Unable to reconstruct Saml2Authentication from JWT", ex);
            return Optional.empty();
        }
    }

    // Redirect for OAuth2 authentication logout
    private void getRedirectOauth2(
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
        switch (registrationId.toLowerCase(Locale.ROOT)) {
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
    private void getRedirectJwt(
            HttpServletRequest request,
            HttpServletResponse response,
            JwtAuthenticationToken jwtAuthenticationToken)
            throws IOException {
        OAUTH2 oauth = securityProperties.getOauth2();
        String path = checkForErrors(request);
        String redirectUrl = UrlUtils.getOrigin(request) + "/login?" + path;
        boolean isApi = isApiRequest(request);

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

        if (endSessionEndpoint != null) {
            StringBuilder logoutUrlBuilder = new StringBuilder(endSessionEndpoint);
            logoutUrlBuilder.append(endSessionEndpoint.contains("?") ? "&" : "?");

            // Use client_id and post_logout_redirect_uri
            if (clientId != null && !clientId.isBlank()) {
                logoutUrlBuilder.append("client_id=").append(clientId).append("&");
            }
            String encodedRedirectUri = URLEncoder.encode(redirectUrl, StandardCharsets.UTF_8);
            logoutUrlBuilder.append("post_logout_redirect_uri=").append(encodedRedirectUri);

            String logoutUrl = logoutUrlBuilder.toString();
            log.info("JWT-based OAuth2 logout URL: {}", logoutUrl);

            // Return JSON for API requests, redirect for browser requests
            if (isApi) {
                sendJsonLogoutResponse(response, logoutUrl);
            } else {
                response.sendRedirect(logoutUrl);
            }
        } else {
            // No OIDC logout endpoint available - fallback to local logout
            log.info(
                    "No OIDC logout endpoint available for issuer: {}. Using local logout: {}",
                    issuer,
                    redirectUrl);
            if (isApi) {
                sendJsonLogoutResponse(response, redirectUrl);
            } else {
                response.sendRedirect(redirectUrl);
            }
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

        if (endSessionEndpoint != null) {
            StringBuilder logoutUrlBuilder = new StringBuilder(endSessionEndpoint);

            // Extract id_token_hint if available
            Object principal = oAuthToken.getPrincipal();

            if (principal instanceof OidcUser oidcUser) {
                String idToken = oidcUser.getIdToken().getTokenValue();
                logoutUrlBuilder
                        .append(
                                endSessionEndpoint.contains("?")
                                        ? "&"
                                        : "?") // Handle existing params
                        .append("id_token_hint=")
                        .append(idToken)
                        .append("&post_logout_redirect_uri=")
                        .append(URLEncoder.encode(redirectUrl, StandardCharsets.UTF_8));

                // client_id is optional when id_token_hint is present, but included for
                // compatibility
                if (clientId != null && !clientId.isBlank()) {
                    logoutUrlBuilder.append("&client_id=").append(clientId);
                }

                log.info("Session-aware OIDC logout: {}", endSessionEndpoint);
            } else {
                logoutUrlBuilder.append(endSessionEndpoint.contains("?") ? "&" : "?");
                if (clientId != null && !clientId.isBlank()) {
                    logoutUrlBuilder.append("client_id=").append(clientId).append("&");
                }
                logoutUrlBuilder
                        .append("post_logout_redirect_uri=")
                        .append(URLEncoder.encode(redirectUrl, StandardCharsets.UTF_8));
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

    /**
     * Discovers the OIDC end_session_endpoint from the provider's .well-known/openid-configuration
     * Uses a cache to avoid repeated HTTP calls
     *
     * @param issuer The OIDC issuer URL
     * @return The end_session_endpoint URL, or null if not found/supported
     */
    private String discoverEndSessionEndpoint(String issuer) {
        if (endSessionEndpointCache.containsKey(issuer)) {
            return endSessionEndpointCache.get(issuer);
        }

        try {
            String discoveryUrl = issuer;
            if (!discoveryUrl.endsWith("/")) {
                discoveryUrl += "/";
            }
            discoveryUrl += ".well-known/openid-configuration";

            log.debug("Discovery URL: {}", discoveryUrl);

            RestClient restClient =
                    RestClient.builder()
                            .baseUrl(discoveryUrl)
                            .defaultHeaders(headers -> headers.set("Accept", "application/json"))
                            .build();

            // Fetch and parse OIDC discovery document
            Map discoveryDoc =
                    restClient
                            .get()
                            .retrieve()
                            .onStatus(
                                    status -> !status.is2xxSuccessful(),
                                    (request, response) ->
                                            log.warn(
                                                    "Failed to discover OIDC endpoints for {}: HTTP status {}",
                                                    issuer,
                                                    response.getStatusCode().value()))
                            .body(Map.class);

            if (discoveryDoc != null && discoveryDoc.containsKey("end_session_endpoint")) {
                String endpoint = (String) discoveryDoc.get("end_session_endpoint");
                if (endpoint != null && !endpoint.isBlank()) {
                    log.info("Discovered end_session_endpoint : {}", endpoint);
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

    /** Check if the request expects a JSON response (API/XHR request) */
    private boolean isApiRequest(HttpServletRequest request) {
        String accept = request.getHeader("Accept");
        String xRequestedWith = request.getHeader("X-Requested-With");
        return (accept != null && accept.contains("application/json"))
                || "XMLHttpRequest".equals(xRequestedWith);
    }

    /** Send JSON response with logout URL for API requests */
    private void sendJsonLogoutResponse(HttpServletResponse response, String logoutUrl)
            throws IOException {
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        // Escape the URL for JSON
        String escapedUrl = logoutUrl.replace("\\", "\\\\").replace("\"", "\\\"");
        response.getWriter().write("{\"logoutUrl\":\"" + escapedUrl + "\"}");
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
