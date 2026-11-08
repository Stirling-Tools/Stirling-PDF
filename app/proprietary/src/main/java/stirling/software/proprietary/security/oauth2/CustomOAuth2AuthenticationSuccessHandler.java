package stirling.software.proprietary.security.oauth2;

import static stirling.software.proprietary.security.model.AuthenticationType.OAUTH2;

import java.io.IOException;
import java.sql.SQLException;
import java.util.Map;
import java.util.Optional;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.SavedRequestAwareAuthenticationSuccessHandler;
import org.springframework.security.web.savedrequest.SavedRequest;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import lombok.RequiredArgsConstructor;
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
import stirling.software.proprietary.security.util.RedirectBaseUrl;

@Slf4j
@RequiredArgsConstructor
public class CustomOAuth2AuthenticationSuccessHandler
        extends SavedRequestAwareAuthenticationSuccessHandler {

    private final LoginAttemptService loginAttemptService;
    private final ApplicationProperties.Security.OAUTH2 oauth2Properties;
    private final UserService userService;
    private final JwtServiceInterface jwtService;
    private final stirling.software.proprietary.service.UserLicenseSettingsService
            licenseSettingsService;
    private final ApplicationProperties applicationProperties;

    @Override
    @Audited(type = AuditEventType.USER_LOGIN, level = AuditLevel.BASIC)
    public void onAuthenticationSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws ServletException, IOException {

        Object principal = authentication.getPrincipal();
        String username = "";

        if (principal instanceof OAuth2User oAuth2User) {
            username = oAuth2User.getName();
        } else if (principal instanceof UserDetails detailsUser) {
            username = detailsUser.getUsername();
        }

        boolean userExists = userService.usernameExistsIgnoreCase(username);

        if (!userExists && licenseSettingsService.wouldExceedLimit(1)) {
            response.sendRedirect(request.getContextPath() + "/logout?maxUsersReached=true");
            return;
        }

        // Get the saved request
        HttpSession session = request.getSession(false);
        String contextPath = request.getContextPath();
        SavedRequest savedRequest =
                (session != null)
                        ? (SavedRequest) session.getAttribute("SPRING_SECURITY_SAVED_REQUEST")
                        : null;

        if (savedRequest != null
                && !RequestUriUtils.isStaticResource(contextPath, savedRequest.getRedirectUrl())) {
            // Redirect to the original destination
            super.onAuthenticationSuccess(request, response, authentication);
        } else {
            if (loginAttemptService.isBlocked(username)) {
                if (session != null) {
                    session.removeAttribute("SPRING_SECURITY_SAVED_REQUEST");
                }
                throw new LockedException(
                        "Your account has been locked due to too many failed login attempts.");
            }
            if (userService.isUserDisabled(username)) {
                getRedirectStrategy()
                        .sendRedirect(request, response, "/logout?userIsDisabled=true");
                return;
            }
            boolean isSsoUser = userService.isSsoAuthenticationTypeByUsername(username);
            if (userExists && userService.hasPassword(username) && !isSsoUser) {
                response.sendRedirect(contextPath + "/logout?oAuth2AuthenticationErrorWeb=true");
                return;
            }

            try {
                if (oauth2Properties.getBlockRegistration()
                        && !userService.usernameExistsIgnoreCase(username)) {
                    response.sendRedirect(contextPath + "/logout?oAuth2AdminBlockedUser=true");
                    return;
                }
                if (principal instanceof OAuth2User oAuth2User) {
                    // Extract SSO provider information from OAuth2User
                    String ssoProviderId = oAuth2User.getAttribute("sub"); // OIDC ID
                    // Extract provider from authentication - need to get it from the token/request
                    // For now, we'll extract it in a more generic way
                    String ssoProvider = extractProviderFromAuthentication(authentication);

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
                        jwt = jwtService.generateToken(authentication, claims);
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

    /**
     * Extracts the OAuth2 provider registration ID from the authentication object.
     *
     * @param authentication The authentication object
     * @return The provider registration ID (e.g., "google", "github"), or null if not available
     */
    private String extractProviderFromAuthentication(Authentication authentication) {
        if (authentication instanceof OAuth2AuthenticationToken oauth2Token) {
            return oauth2Token.getAuthorizedClientRegistrationId();
        }
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
        Optional<String> landingBase =
                RedirectBaseUrl.landingBase(
                        oauth2Properties.getRedirectBaseUrl(),
                        applicationProperties.getSystem().getFrontendUrl());
        // The SPA cookie path already includes the browser-side base path, so only add an origin.
        boolean usesCookiePath =
                !TauriOAuthUtils.isTauriState(request) && cookieRedirectPath(request) != null;
        String pathPrefix = landingBase.isPresent() && !usesCookiePath ? "" : contextPath;
        String redirectPath = resolveRedirectPath(request, pathPrefix);
        Optional<String> configuredBase =
                usesCookiePath ? landingBase.flatMap(RedirectBaseUrl::origin) : landingBase;
        String origin = configuredBase.orElse("");
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
        String cookiePath = cookieRedirectPath(request);
        return cookiePath != null ? cookiePath : TauriOAuthUtils.defaultCallbackPath(contextPath);
    }

    private String cookieRedirectPath(HttpServletRequest request) {
        String cookiePath = TauriOAuthUtils.extractRedirectPathFromCookie(request);
        return cookiePath != null && TauriOAuthUtils.isLocalRedirectPath(cookiePath)
                ? cookiePath
                : null;
    }

    private void clearRedirectCookie(HttpServletResponse response) {
        ResponseCookie cookie =
                ResponseCookie.from(TauriOAuthUtils.SPA_REDIRECT_COOKIE, "")
                        .path("/")
                        .sameSite("Lax")
                        .maxAge(0)
                        .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}
