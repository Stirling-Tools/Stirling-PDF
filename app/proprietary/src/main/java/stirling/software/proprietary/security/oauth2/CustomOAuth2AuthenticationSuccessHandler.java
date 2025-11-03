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

@RequiredArgsConstructor
public class CustomOAuth2AuthenticationSuccessHandler
        extends SavedRequestAwareAuthenticationSuccessHandler {

    private final LoginAttemptService loginAttemptService;
    private final ApplicationProperties.Security.OAUTH2 oauth2Properties;
    private final UserService userService;
    private final JwtServiceInterface jwtService;

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

                    // Build context-aware redirect URL based on the original request
                    String redirectUrl = buildContextAwareRedirectUrl(request, contextPath, jwt);

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
     * @param contextPath The application context path
     * @param jwt The JWT token to include
     * @return The appropriate redirect URL
     */
    private String buildContextAwareRedirectUrl(
            HttpServletRequest request, String contextPath, String jwt) {
        // Try to get the origin from the Referer header first
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
                return origin + "/auth/callback#access_token=" + jwt;
            } catch (java.net.MalformedURLException e) {
                // Fall back to other methods if referer is malformed
            }
        }

        // Fall back to building from request host/port
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

        return origin.toString() + "/auth/callback#access_token=" + jwt;
    }
}
