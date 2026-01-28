package stirling.software.proprietary.security;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.saml2.provider.service.authentication.Saml2Authentication;
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;
import org.springframework.security.web.authentication.logout.SimpleUrlLogoutSuccessHandler;

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
                                    + keycloak.getClientId()
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
