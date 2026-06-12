package stirling.software.proprietary.security.oauth2;

import static stirling.software.proprietary.security.model.AuthenticationType.OAUTH2;

import java.io.IOException;
import java.net.URI;
import java.sql.SQLException;
import java.util.Map;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.ws.rs.core.HttpHeaders;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.common.util.RequestUriUtils;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.util.DesktopClientUtils;

// TODO: Migration required - this class extended Spring Security's
// SavedRequestAwareAuthenticationSuccessHandler, which has no Quarkus equivalent. Under quarkus-oidc
// there is no AuthenticationSuccessHandler concept; the post-login OAuth2 success flow must be
// rehosted, e.g. via a SecurityIdentityAugmentor plus a JAX-RS callback resource (or a
// jakarta.servlet endpoint) that performs the redirect/JWT-issuance below. The Spring
// Authentication/OAuth2User/OAuth2AuthenticationToken/SavedRequest types referenced here must be
// replaced with quarkus-oidc equivalents (io.quarkus.security.identity.SecurityIdentity,
// io.quarkus.oidc.IdToken/UserInfo, etc.). The user-mapping, eligibility, JWT and redirect logic is
// preserved verbatim below so it can be re-wired without re-deriving it.
@Slf4j
@ApplicationScoped
public class CustomOAuth2AuthenticationSuccessHandler {

    @Inject LoginAttemptService loginAttemptService;
    @Inject ApplicationProperties.Security.OAUTH2 oauth2Properties;
    @Inject UserService userService;
    @Inject JwtServiceInterface jwtService;
    @Inject stirling.software.proprietary.service.UserLicenseSettingsService licenseSettingsService;
    @Inject ApplicationProperties applicationProperties;

    // TODO: Migration required - the original signature took a Spring Security
    // org.springframework.security.core.Authentication. Under quarkus-oidc this should receive an
    // io.quarkus.security.identity.SecurityIdentity (or the OIDC IdToken/UserInfo). The "authentication"
    // parameter is now typed as Object so the body still compiles; replace it with the real
    // quarkus-oidc principal type and re-implement principal extraction below when wiring the
    // success flow.
    @Audited(type = AuditEventType.USER_LOGIN, level = AuditLevel.BASIC)
    public void onAuthenticationSuccess(
            HttpServletRequest request, HttpServletResponse response, Object authentication)
            throws ServletException, IOException {

        String username = "";
        // TODO: Migration required - principal extraction relied on Spring Security OAuth2User /
        // UserDetails. Derive the username from the quarkus-oidc principal (SecurityIdentity /
        // IdToken claims) instead.
        username = extractUsername(authentication);

        boolean userExists = userService.usernameExistsIgnoreCase(username);

        // Check if user is eligible for OAuth (grandfathered or system has paid license)
        if (userExists) {
            stirling.software.proprietary.security.model.User user =
                    userService.findByUsernameIgnoreCase(username).orElse(null);

            if (user != null && !licenseSettingsService.isOAuthEligible(user)) {
                // User is not grandfathered and no paid license - block OAuth login
                log.warn(
                        "OAuth login blocked for existing user '{}' - not eligible (not grandfathered and no paid license)",
                        username);
                response.sendRedirect(
                        request.getContextPath() + "/logout?oAuth2RequiresLicense=true");
                return;
            }
        } else if (!licenseSettingsService.isOAuthEligible(null)) {
            // No existing user and no paid license -> block auto creation
            log.warn(
                    "OAuth login blocked for new user '{}' - not eligible (no paid license for auto-creation)",
                    username);
            response.sendRedirect(request.getContextPath() + "/logout?oAuth2RequiresLicense=true");
            return;
        }

        // Get the saved request
        HttpSession session = request.getSession(false);
        String contextPath = request.getContextPath();
        // TODO: Migration required - SavedRequest / "SPRING_SECURITY_SAVED_REQUEST" is a Spring
        // Security web construct. Under quarkus-oidc the original target URL is preserved via the
        // OIDC state/restore-path mechanism (quarkus.oidc.authentication.restore-path-after-redirect)
        // rather than a session attribute. Re-implement saved-request resolution accordingly; the
        // session attribute read below is left as a placeholder and will currently be null.
        Object savedRequest =
                (session != null)
                        ? session.getAttribute("SPRING_SECURITY_SAVED_REQUEST")
                        : null;

        if (savedRequest != null
                && !RequestUriUtils.isStaticResource(
                        contextPath, getSavedRedirectUrl(savedRequest))) {
            // TODO: Migration required - originally delegated to
            // SavedRequestAwareAuthenticationSuccessHandler.onAuthenticationSuccess to redirect to
            // the saved request. Reimplement the redirect to the saved/original destination here
            // once the quarkus-oidc saved-request mechanism is in place.
            redirectToSavedRequest(request, response, savedRequest);
        } else {
            if (loginAttemptService.isBlocked(username)) {
                if (session != null) {
                    session.removeAttribute("SPRING_SECURITY_SAVED_REQUEST");
                }
                // TODO: Migration required - originally threw Spring Security's
                // org.springframework.security.authentication.LockedException. Replace with the
                // exception type the quarkus-oidc success flow expects (or a redirect to a locked
                // page); throwing a plain IllegalStateException here as a placeholder.
                throw new IllegalStateException(
                        "Your account has been locked due to too many failed login attempts.");
            }
            if (userService.isUserDisabled(username)) {
                // TODO: Migration required - originally used Spring's RedirectStrategy via
                // getRedirectStrategy().sendRedirect(...). Using the servlet response directly.
                response.sendRedirect(contextPath + "/logout?userIsDisabled=true");
                return;
            }
            boolean isSsoUser = userService.isSsoAuthenticationTypeByUsername(username);
            if (userExists
                    && userService.hasPassword(username)
                    && !isSsoUser
                    && oauth2Properties.getAutoCreateUser()) {
                response.sendRedirect(contextPath + "/logout?oAuth2AuthenticationErrorWeb=true");
                return;
            }

            try {
                if (oauth2Properties.getBlockRegistration()
                        && !userService.usernameExistsIgnoreCase(username)) {
                    response.sendRedirect(contextPath + "/logout?oAuth2AdminBlockedUser=true");
                    return;
                }
                if (!userExists && licenseSettingsService.wouldExceedLimit(1)) {
                    response.sendRedirect(contextPath + "/logout?maxUsersReached=true");
                    return;
                }
                // TODO: Migration required - SSO provider/claims extraction relied on Spring
                // Security's OAuth2User attributes and OAuth2AuthenticationToken. Re-derive the
                // OIDC "sub" claim and the provider registration id from the quarkus-oidc principal.
                String ssoProviderId = extractSubClaim(authentication);
                String ssoProvider = extractProviderFromAuthentication(authentication);
                if (ssoProviderId != null || ssoProvider != null) {
                    userService.processSSOPostLogin(
                            username,
                            ssoProviderId,
                            ssoProvider,
                            oauth2Properties.getAutoCreateUser(),
                            OAUTH2);
                }

                // Generate JWT if v2 is enabled
                if (jwtService.isJwtEnabled()) {
                    Map<String, Object> claims = Map.of("authType", AuthenticationType.OAUTH2);

                    // Detect desktop client and issue longer-lived tokens
                    boolean isDesktopClient = DesktopClientUtils.isDesktopClient(request);
                    String jwt;
                    if (isDesktopClient) {
                        // Desktop: Use configured desktop token expiry (default 30 days)
                        int desktopExpiryMinutes =
                                DesktopClientUtils.getDesktopTokenExpiryMinutes(
                                        applicationProperties);
                        jwt = jwtService.generateToken(username, claims, desktopExpiryMinutes);
                        log.info(
                                "Issued DESKTOP OAuth2 token for user '{}': expiry={}min ({}d)",
                                username,
                                desktopExpiryMinutes,
                                desktopExpiryMinutes / 1440);
                    } else {
                        // Web: Use default expiry
                        // TODO: Migration required - JwtServiceInterface.generateToken(Authentication,
                        // claims) takes a Spring Security Authentication. Until JwtServiceInterface is
                        // migrated, issue the token by username (same identity) to avoid the Spring
                        // dependency here.
                        jwt = jwtService.generateToken(username, claims);
                        log.debug("Issued WEB OAuth2 token for user '{}'", username);
                    }

                    // Build context-aware redirect URL based on the original request
                    String redirectUrl =
                            buildContextAwareRedirectUrl(request, response, contextPath, jwt);

                    response.sendRedirect(redirectUrl);
                } else {
                    // v1: redirect directly to home
                    response.sendRedirect(contextPath + "/");
                }
            } catch (IllegalArgumentException | SQLException | UnsupportedProviderException e) {
                response.sendRedirect(contextPath + "/logout?invalidUsername=true");
            }
        }
    }

    // TODO: Migration required - placeholder for principal -> username extraction. Originally used
    // Spring Security OAuth2User.getName() / UserDetails.getUsername(). Implement against the
    // quarkus-oidc principal (SecurityIdentity.getPrincipal().getName() / IdToken claims).
    private String extractUsername(Object authentication) {
        throw new UnsupportedOperationException(
                "TODO: Migration required - extract username from the quarkus-oidc principal");
    }

    // TODO: Migration required - placeholder for the OIDC "sub" claim. Originally
    // oAuth2User.getAttribute("sub"). Read it from the quarkus-oidc IdToken/UserInfo.
    private String extractSubClaim(Object authentication) {
        throw new UnsupportedOperationException(
                "TODO: Migration required - extract the 'sub' claim from the quarkus-oidc principal");
    }

    // TODO: Migration required - placeholder for the saved-request redirect URL. Originally
    // SavedRequest.getRedirectUrl().
    private String getSavedRedirectUrl(Object savedRequest) {
        throw new UnsupportedOperationException(
                "TODO: Migration required - resolve the saved-request redirect URL under quarkus-oidc");
    }

    // TODO: Migration required - placeholder for delegating to the saved-request redirect.
    // Originally SavedRequestAwareAuthenticationSuccessHandler.onAuthenticationSuccess(...).
    private void redirectToSavedRequest(
            HttpServletRequest request, HttpServletResponse response, Object savedRequest)
            throws IOException {
        throw new UnsupportedOperationException(
                "TODO: Migration required - redirect to the saved/original destination under quarkus-oidc");
    }

    /**
     * Extracts the OAuth2 provider registration ID from the authentication object.
     *
     * @param authentication The authentication object
     * @return The provider registration ID (e.g., "google", "github"), or null if not available
     */
    private String extractProviderFromAuthentication(Object authentication) {
        // TODO: Migration required - originally cast to Spring Security's
        // OAuth2AuthenticationToken and called getAuthorizedClientRegistrationId(). Derive the OIDC
        // provider/tenant id from the quarkus-oidc principal instead.
        return null;
    }

    /**
     * Builds a context-aware redirect URL based on the request's origin
     *
     * @param request The HTTP request
     * @param response HTTP response (used to clear redirect cookies)
     * @param contextPath The application context path
     * @param jwt The JWT token to include
     * @return The appropriate redirect URL
     */
    private String buildContextAwareRedirectUrl(
            HttpServletRequest request,
            HttpServletResponse response,
            String contextPath,
            String jwt) {
        String redirectPath = resolveRedirectPath(request, contextPath);
        String origin =
                resolveForwardedOrigin(request)
                        .orElseGet(
                                () ->
                                        resolveOriginFromReferer(request)
                                                .orElseGet(() -> buildOriginFromRequest(request)));
        clearRedirectCookie(response);

        // Extract nonce from state for CSRF validation in callback
        String nonce = TauriOAuthUtils.extractNonceFromRequest(request);
        String url = origin + redirectPath + "#access_token=" + jwt;
        if (nonce != null) {
            url +=
                    "&nonce="
                            + java.net.URLEncoder.encode(
                                    nonce, java.nio.charset.StandardCharsets.UTF_8);
        }
        return url;
    }

    private String resolveRedirectPath(HttpServletRequest request, String contextPath) {
        if (TauriOAuthUtils.isTauriState(request)) {
            return TauriOAuthUtils.defaultTauriCallbackPath(contextPath);
        }
        String cookiePath = TauriOAuthUtils.extractRedirectPathFromCookie(request);
        if (cookiePath != null && cookiePath.startsWith("/")) {
            return cookiePath;
        }
        return TauriOAuthUtils.defaultCallbackPath(contextPath);
    }

    private Optional<String> resolveForwardedOrigin(HttpServletRequest request) {
        String forwardedHostHeader = request.getHeader("X-Forwarded-Host");
        if (forwardedHostHeader == null || forwardedHostHeader.isBlank()) {
            return Optional.empty();
        }
        String host = forwardedHostHeader.split(",")[0].trim();
        if (host.isEmpty()) {
            return Optional.empty();
        }

        String forwardedProtoHeader = request.getHeader("X-Forwarded-Proto");
        String proto =
                (forwardedProtoHeader == null || forwardedProtoHeader.isBlank())
                        ? request.getScheme()
                        : forwardedProtoHeader.split(",")[0].trim();

        if (!host.contains(":")) {
            String forwardedPort = request.getHeader("X-Forwarded-Port");
            if (forwardedPort != null
                    && !forwardedPort.isBlank()
                    && !isDefaultPort(proto, forwardedPort.trim())) {
                host = host + ":" + forwardedPort.trim();
            }
        }
        return Optional.of(proto + "://" + host);
    }

    private Optional<String> resolveOriginFromReferer(HttpServletRequest request) {
        String referer = request.getHeader("Referer");
        if (referer != null && !referer.isEmpty()) {
            try {
                URI refererUri = URI.create(referer);
                String host = refererUri.getHost();
                if (host == null) {
                    return Optional.empty();
                }

                String refererHost = host.toLowerCase();

                if (!isOAuthProviderDomain(refererHost)) {
                    String origin = refererUri.getScheme() + "://" + host;
                    int port = refererUri.getPort();
                    if (port != -1 && port != 80 && port != 443) {
                        origin += ":" + port;
                    }
                    return Optional.of(origin);
                }
            } catch (IllegalArgumentException e) {
                // ignore and fall back
            }
        }
        return Optional.empty();
    }

    private String buildOriginFromRequest(HttpServletRequest request) {
        String scheme = request.getScheme();
        String serverName = request.getServerName();
        int serverPort = request.getServerPort();

        StringBuilder origin = new StringBuilder();
        origin.append(scheme).append("://").append(serverName);

        if ((!"http".equalsIgnoreCase(scheme) || serverPort != 80)
                && (!"https".equalsIgnoreCase(scheme) || serverPort != 443)) {
            origin.append(":").append(serverPort);
        }

        return origin.toString();
    }

    private boolean isDefaultPort(String scheme, String port) {
        if (port == null) {
            return true;
        }
        try {
            int parsedPort = Integer.parseInt(port);
            return ("http".equalsIgnoreCase(scheme) && parsedPort == 80)
                    || ("https".equalsIgnoreCase(scheme) && parsedPort == 443);
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private void clearRedirectCookie(HttpServletResponse response) {
        // TODO: Migration required - originally built the Set-Cookie value with Spring's
        // org.springframework.http.ResponseCookie. Replaced with a manually built RFC 6265
        // Set-Cookie string to drop the Spring HTTP dependency. Consider switching to
        // jakarta.servlet.http.Cookie / response.addCookie once SameSite handling is confirmed.
        String cookie =
                TauriOAuthUtils.SPA_REDIRECT_COOKIE
                        + "=; Path=/; Max-Age=0; SameSite=Lax";
        response.addHeader(HttpHeaders.SET_COOKIE, cookie);
    }

    /**
     * Checks if the given hostname belongs to a known OAuth provider.
     *
     * @param hostname The hostname to check
     * @return true if it's an OAuth provider domain, false otherwise
     */
    private boolean isOAuthProviderDomain(String hostname) {
        return hostname.contains("google.com")
                || hostname.contains("googleapis.com")
                || hostname.contains("github.com")
                || hostname.contains("microsoft.com")
                || hostname.contains("microsoftonline.com")
                || hostname.contains("linkedin.com")
                || hostname.contains("apple.com");
    }
}
