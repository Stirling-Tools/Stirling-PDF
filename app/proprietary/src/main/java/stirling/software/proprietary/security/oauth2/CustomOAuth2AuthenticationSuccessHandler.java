package stirling.software.proprietary.security.oauth2;

import static stirling.software.proprietary.security.model.AuthenticationType.OAUTH2;
import static stirling.software.proprietary.security.model.AuthenticationType.SSO;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
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
import jakarta.servlet.http.Cookie;
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

    private static final String SPA_REDIRECT_COOKIE = "stirling_redirect_path";
    private static final String DEFAULT_CALLBACK_PATH = "/auth/callback";

    private final LoginAttemptService loginAttemptService;
    private final ApplicationProperties.Security.OAUTH2 oauth2Properties;
    private final UserService userService;
    private final JwtServiceInterface jwtService;
    private final stirling.software.proprietary.service.UserLicenseSettingsService
            licenseSettingsService;

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

        // Check if user is eligible for OAuth (grandfathered or system has paid license)
        if (userExists) {
            stirling.software.proprietary.security.model.User user =
                    userService.findByUsernameIgnoreCase(username).orElse(null);

            if (user != null && !licenseSettingsService.isOAuthEligible(user)) {
                // User is not grandfathered and no paid license - block OAuth login
                response.sendRedirect(
                        request.getContextPath() + "/logout?oAuth2RequiresLicense=true");
                return;
            }
        } else if (!licenseSettingsService.isOAuthEligible(null)) {
            // No existing user and no paid license -> block auto creation
            response.sendRedirect(request.getContextPath() + "/logout?oAuth2RequiresLicense=true");
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
            if (userExists
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
                if (!userExists && licenseSettingsService.wouldExceedLimit(1)) {
                    response.sendRedirect(contextPath + "/logout?maxUsersReached=true");
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
        String redirectPath = resolveRedirectPath(request, contextPath);
        String origin =
                resolveForwardedOrigin(request)
                        .orElseGet(
                                () ->
                                        resolveOriginFromReferer(request)
                                                .orElseGet(() -> buildOriginFromRequest(request)));
        clearRedirectCookie(response);
        return origin + redirectPath + "#access_token=" + jwt;
    }

    private String resolveRedirectPath(HttpServletRequest request, String contextPath) {
        return extractRedirectPathFromCookie(request)
                .filter(path -> path.startsWith("/"))
                .orElseGet(() -> defaultCallbackPath(contextPath));
    }

    private Optional<String> extractRedirectPathFromCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return Optional.empty();
        }
        for (Cookie cookie : cookies) {
            if (SPA_REDIRECT_COOKIE.equals(cookie.getName())) {
                String value = URLDecoder.decode(cookie.getValue(), StandardCharsets.UTF_8).trim();
                if (!value.isEmpty()) {
                    return Optional.of(value);
                }
            }
        }
        return Optional.empty();
    }

    private String defaultCallbackPath(String contextPath) {
        if (contextPath == null
                || contextPath.isBlank()
                || "/".equals(contextPath)
                || "\\".equals(contextPath)) {
            return DEFAULT_CALLBACK_PATH;
        }
        return contextPath + DEFAULT_CALLBACK_PATH;
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
                java.net.URL refererUrl = new java.net.URL(referer);
                String refererHost = refererUrl.getHost().toLowerCase();

                if (!isOAuthProviderDomain(refererHost)) {
                    String origin = refererUrl.getProtocol() + "://" + refererUrl.getHost();
                    if (refererUrl.getPort() != -1
                            && refererUrl.getPort() != 80
                            && refererUrl.getPort() != 443) {
                        origin += ":" + refererUrl.getPort();
                    }
                    return Optional.of(origin);
                }
            } catch (java.net.MalformedURLException e) {
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
        ResponseCookie cookie =
                ResponseCookie.from(SPA_REDIRECT_COOKIE, "")
                        .path("/")
                        .sameSite("Lax")
                        .maxAge(0)
                        .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
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
