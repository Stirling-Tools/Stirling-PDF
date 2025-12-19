package stirling.software.proprietary.security;

import java.io.IOException;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPrivateKey;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.saml2.provider.service.authentication.Saml2Authentication;
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;
import org.springframework.security.web.authentication.logout.SimpleUrlLogoutSuccessHandler;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.AppConfig;
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
    private final AppConfig appConfig;
    private final JwtServiceInterface jwtService;
    private final LogoutSuccessHandler samlLogoutHandler;

    public CustomLogoutSuccessHandler(
            ApplicationProperties.Security securityProperties,
            AppConfig appConfig,
            JwtServiceInterface jwtService) {
        this(securityProperties, appConfig, jwtService, null);
    }

    public CustomLogoutSuccessHandler(
            ApplicationProperties.Security securityProperties,
            AppConfig appConfig,
            JwtServiceInterface jwtService,
            LogoutSuccessHandler samlLogoutHandler) {
        this.securityProperties = securityProperties;
        this.appConfig = appConfig;
        this.jwtService = jwtService;
        this.samlLogoutHandler = samlLogoutHandler;
    }

    @Override
    @Audited(type = AuditEventType.USER_LOGOUT, level = AuditLevel.BASIC)
    public void onLogoutSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException {

        if (!response.isCommitted()) {
            // Handle SAML2 SLO
            Optional<String> samlNameId = resolveSamlNameId(authentication, request);
            if (samlNameId.isPresent()) {
                if (samlLogoutHandler != null) {
                    log.info("SAML user {} logging out via IdP SLO", samlNameId.get());
                    try {
                        samlLogoutHandler.onLogoutSuccess(request, response, authentication);
                    } catch (Exception e) {
                        log.error("SAML SLO failed, falling back to local logout", e);
                        getRedirectStrategy().sendRedirect(request, response, LOGOUT_PATH);
                    }
                } else {
                    // SAML Single Logout disabled - just do local logout
                    log.info("SAML user {} logging out locally (SLO disabled)", samlNameId.get());
                    getRedirectStrategy().sendRedirect(request, response, LOGOUT_PATH);
                }
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

    private Optional<String> resolveSamlNameId(
            Authentication authentication, HttpServletRequest request) {
        if (authentication instanceof Saml2Authentication samlAuthentication) {
            CustomSaml2AuthenticatedPrincipal principal =
                    (CustomSaml2AuthenticatedPrincipal) samlAuthentication.getPrincipal();
            String nameId = principal.nameId();

            if (nameId != null && !nameId.isBlank()) {
                return Optional.of(nameId);
            }
        }

        if (jwtService != null) {
            try {
                String token = jwtService.extractToken(request);

                if (token != null && !token.isBlank()) {
                    Map<String, Object> claims = jwtService.extractClaims(token);
                    Object authType = claims.get("authType");

                    if (authType != null && "SAML2".equalsIgnoreCase(authType.toString())) {
                        Object nameId = claims.get("samlNameId");
                        log.debug("Resolved SAML NameID from JWT: {}", nameId);
                        return Optional.of((String) nameId);
                    }
                }
            } catch (Exception ex) {
                log.debug("Unable to resolve SAML NameID from JWT during logout", ex);
            }
        }

        return Optional.empty();
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
