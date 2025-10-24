package stirling.software.proprietary.security.oauth2;

import static stirling.software.proprietary.security.model.AuthenticationType.OAUTH2;
import static stirling.software.proprietary.security.model.AuthenticationType.SSO;

import java.io.IOException;
import java.sql.SQLException;
import java.util.Map;

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
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;

@Slf4j
@RequiredArgsConstructor
public class CustomOAuth2AuthenticationSuccessHandler
        extends SavedRequestAwareAuthenticationSuccessHandler {

    private final LoginAttemptService loginAttemptService;
    private final ApplicationProperties.Security.OAUTH2 oauth2Properties;
    private final UserService userService;
    private final JwtServiceInterface jwtService;
    private final ApplicationProperties applicationProperties;

    @Override
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
            if (userService.usernameExistsIgnoreCase(username)
                    && userService.hasPassword(username)
                    && (!userService.isAuthenticationTypeByUsername(username, SSO)
                            || !userService.isAuthenticationTypeByUsername(username, OAUTH2))
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
                    String jwt =
                            jwtService.generateToken(
                                    authentication, Map.of("authType", AuthenticationType.OAUTH2));

                    // Set JWT as HttpOnly cookie for security
                    setJwtCookie(response, jwt, contextPath);

                    // Build context-aware redirect URL (without JWT in URL)
                    String redirectUrl = buildContextAwareRedirectUrl(request, contextPath);

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
     * Sets JWT as an HttpOnly cookie for security
     * Prevents XSS attacks by making token inaccessible to JavaScript
     *
     * @param response HTTP response to set cookie
     * @param jwt JWT token to store
     * @param contextPath Application context path for cookie path
     */
    private void setJwtCookie(HttpServletResponse response, String jwt, String contextPath) {
        jakarta.servlet.http.Cookie cookie = new jakarta.servlet.http.Cookie("stirling_jwt", jwt);
        cookie.setHttpOnly(true); // Prevent JavaScript access (XSS protection)
        cookie.setSecure(true); // Only send over HTTPS (set to false for local dev if needed)
        cookie.setPath(contextPath.isEmpty() ? "/" : contextPath); // Cookie available for entire app
        cookie.setMaxAge(3600); // 1 hour (matches JWT expiration)
        cookie.setAttribute("SameSite", "Lax"); // CSRF protection
        response.addCookie(cookie);
    }

    /**
     * Validates if the origin is in the CORS whitelist
     *
     * @param origin Origin to validate
     * @return true if origin is whitelisted or no whitelist configured
     */
    private boolean isOriginWhitelisted(String origin) {
        if (applicationProperties.getSystem() == null
                || applicationProperties.getSystem().getCorsAllowedOrigins() == null
                || applicationProperties.getSystem().getCorsAllowedOrigins().isEmpty()) {
            // No whitelist configured - only trust request origin
            return false;
        }

        return applicationProperties.getSystem().getCorsAllowedOrigins().contains(origin);
    }

    /**
     * Builds a context-aware redirect URL based on the request's origin
     * Validates Referer against CORS whitelist to prevent token leakage to third parties
     *
     * @param request The HTTP request
     * @param contextPath The application context path
     * @return The appropriate redirect URL
     */
    private String buildContextAwareRedirectUrl(HttpServletRequest request, String contextPath) {
        // Try to get the origin from the Referer header
        String referer = request.getHeader("Referer");
        if (referer != null && !referer.isEmpty()) {
            try {
                java.net.URL refererUrl = new java.net.URL(referer);
                String origin = refererUrl.getProtocol() + "://" + refererUrl.getHost();
                if (refererUrl.getPort() != -1
                        && refererUrl.getPort() != 80
                        && refererUrl.getPort() != 443) {
                    origin += ":" + refererUrl.getPort();
                }

                // SECURITY: Only trust Referer if it's in the CORS whitelist
                // This prevents redirecting with JWT to untrusted domains (e.g., IdP domain)
                if (isOriginWhitelisted(origin)) {
                    log.debug(
                            "Using whitelisted Referer origin for redirect: {}",
                            origin);
                    return origin + "/auth/callback";
                } else {
                    log.warn(
                            "Referer origin {} not in CORS whitelist, falling back to request origin",
                            origin);
                }
            } catch (java.net.MalformedURLException e) {
                log.warn("Malformed Referer URL, falling back to request origin: {}", referer);
            }
        }

        // Fall back to building from request host/port (always safe)
        String scheme = request.getScheme();
        String serverName = request.getServerName();
        int serverPort = request.getServerPort();

        StringBuilder origin = new StringBuilder();
        origin.append(scheme).append("://").append(serverName);

        // Only add port if it's not the default port for the scheme
        if ((!"http".equals(scheme) || serverPort != 80)
                && (!"https".equals(scheme) || serverPort != 443)) {
            origin.append(":").append(serverPort);
        }

        log.debug("Using request origin for redirect: {}", origin);
        return origin + "/auth/callback";
    }
}
