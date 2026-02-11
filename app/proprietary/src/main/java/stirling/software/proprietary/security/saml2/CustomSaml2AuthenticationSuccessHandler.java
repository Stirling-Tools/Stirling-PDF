package stirling.software.proprietary.security.saml2;

import static stirling.software.proprietary.security.model.AuthenticationType.SAML2;

import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.Map;
import java.util.Optional;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.SavedRequestAwareAuthenticationSuccessHandler;
import org.springframework.security.web.savedrequest.SavedRequest;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.common.util.RequestUriUtils;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.oauth2.TauriOAuthUtils;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;

@AllArgsConstructor
@Slf4j
public class CustomSaml2AuthenticationSuccessHandler
        extends SavedRequestAwareAuthenticationSuccessHandler {

    private static final String SPA_REDIRECT_COOKIE = "stirling_redirect_path";
    private static final String DEFAULT_CALLBACK_PATH = "/auth/callback";

    private LoginAttemptService loginAttemptService;
    private ApplicationProperties.Security.SAML2 saml2Properties;
    private UserService userService;
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
        log.debug("Starting SAML2 authentication success handling");

        if (principal instanceof CustomSaml2AuthenticatedPrincipal saml2Principal) {
            String username = saml2Principal.name();
            log.debug("Authenticated principal found for user: {}", username);

            boolean userExists = userService.usernameExistsIgnoreCase(username);

            // Check if user is eligible for SAML (grandfathered or system has ENTERPRISE license)
            if (userExists) {
                stirling.software.proprietary.security.model.User user =
                        userService.findByUsernameIgnoreCase(username).orElse(null);

                if (user != null && !licenseSettingsService.isSamlEligible(user)) {
                    // User is not grandfathered and no ENTERPRISE license - block SAML login
                    log.warn(
                            "SAML2 login blocked for existing user '{}' - not eligible (not grandfathered and no ENTERPRISE license)",
                            username);
                    String origin = resolveOrigin(request);
                    response.sendRedirect(origin + "/logout?saml2RequiresLicense=true");
                    return;
                }
            } else if (!licenseSettingsService.isSamlEligible(null)) {
                // No existing user and no ENTERPRISE license -> block auto creation
                log.warn(
                        "SAML2 login blocked for new user '{}' - not eligible (no ENTERPRISE license for auto-creation)",
                        username);
                String origin = resolveOrigin(request);
                response.sendRedirect(origin + "/logout?saml2RequiresLicense=true");
                return;
            }

            HttpSession session = request.getSession(false);
            String contextPath = request.getContextPath();
            SavedRequest savedRequest =
                    (session != null)
                            ? (SavedRequest) session.getAttribute("SPRING_SECURITY_SAVED_REQUEST")
                            : null;

            log.debug(
                    "Session exists: {}, Saved request exists: {}",
                    session != null,
                    savedRequest != null);

            if (savedRequest != null
                    && !RequestUriUtils.isStaticResource(
                            contextPath, savedRequest.getRedirectUrl())) {
                log.debug(
                        "Valid saved request found, redirecting to original destination: {}",
                        savedRequest.getRedirectUrl());
                super.onAuthenticationSuccess(request, response, authentication);
            } else {
                log.debug(
                        "Processing SAML2 authentication with autoCreateUser: {}",
                        saml2Properties.getAutoCreateUser());

                if (loginAttemptService.isBlocked(username)) {
                    log.debug("User {} is blocked due to too many login attempts", username);
                    if (session != null) {
                        session.removeAttribute("SPRING_SECURITY_SAVED_REQUEST");
                    }
                    throw new LockedException(
                            "Your account has been locked due to too many failed login attempts.");
                }

                boolean hasPassword = userExists && userService.hasPassword(username);
                boolean isSsoUser =
                        userExists && userService.isSsoAuthenticationTypeByUsername(username);
                boolean isSAML2User =
                        userExists && userService.isAuthenticationTypeByUsername(username, SAML2);

                log.debug(
                        "User status - Exists: {}, Has password: {}, Is SSO user: {}, Is SAML2 user: {}",
                        userExists,
                        hasPassword,
                        isSsoUser,
                        isSAML2User);

                if (userExists
                        && hasPassword
                        && !isSsoUser
                        && saml2Properties.getAutoCreateUser()) {
                    log.debug(
                            "User {} exists with password but is not an SSO user, redirecting to logout",
                            username);
                    String origin = resolveOrigin(request);
                    response.sendRedirect(origin + "/logout?oAuth2AuthenticationErrorWeb=true");
                    return;
                }

                try {
                    // Block new users only if: blockRegistration is true OR autoCreateUser is false
                    if (!userExists
                            && (saml2Properties.getBlockRegistration()
                                    || !saml2Properties.getAutoCreateUser())) {
                        log.debug(
                                "Registration blocked for new user '{}' (blockRegistration: {}, autoCreateUser: {})",
                                username,
                                saml2Properties.getBlockRegistration(),
                                saml2Properties.getAutoCreateUser());
                        String origin = resolveOrigin(request);
                        response.sendRedirect(origin + "/login?errorOAuth=oAuth2AdminBlockedUser");
                        return;
                    }
                    if (!userExists && licenseSettingsService.wouldExceedLimit(1)) {
                        String origin = resolveOrigin(request);
                        response.sendRedirect(origin + "/logout?maxUsersReached=true");
                        return;
                    }

                    // Extract SSO provider information from SAML2 assertion
                    String ssoProviderId = saml2Principal.nameId();
                    String ssoProvider = "saml2"; // fixme

                    log.debug(
                            "Processing SSO post-login for user: {} (Provider: {}, ProviderId: {})",
                            username,
                            ssoProvider,
                            ssoProviderId);

                    userService.processSSOPostLogin(
                            username,
                            ssoProviderId,
                            ssoProvider,
                            saml2Properties.getAutoCreateUser(),
                            SAML2);
                    log.debug("Successfully processed authentication for user: {}", username);

                    // Generate JWT if v2 is enabled
                    if (jwtService.isJwtEnabled()) {
                        String jwt =
                                jwtService.generateToken(
                                        authentication,
                                        Map.of("authType", AuthenticationType.SAML2));

                        // Build context-aware redirect URL based on the original request
                        String redirectUrl =
                                buildContextAwareRedirectUrl(request, response, contextPath, jwt);

                        response.sendRedirect(redirectUrl);
                    } else {
                        // v1: redirect directly to home
                        response.sendRedirect(contextPath + "/");
                    }
                } catch (IllegalArgumentException | SQLException | UnsupportedProviderException e) {
                    log.debug(
                            "Invalid username detected for user: {}, redirecting to logout",
                            username);
                    response.sendRedirect(contextPath + "/logout?invalidUsername=true");
                }
            }
        } else {
            log.debug("Non-SAML2 principal detected, delegating to parent handler");
            super.onAuthenticationSuccess(request, response, authentication);
        }
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
            HttpServletRequest request,
            HttpServletResponse response,
            String contextPath,
            String jwt) {
        String redirectPath = resolveRedirectPath(request, contextPath);
        String origin = resolveOrigin(request);
        clearRedirectCookie(response);
        String url = origin + redirectPath + "#access_token=" + jwt;

        String nonce = TauriSamlUtils.extractNonceFromRequest(request);
        if (nonce != null) {
            url +=
                    "&nonce="
                            + java.net.URLEncoder.encode(
                                    nonce, java.nio.charset.StandardCharsets.UTF_8);
        }
        return url;
    }

    /**
     * Resolve the origin (frontend URL) for redirects. First checks system.frontendUrl from config,
     * then falls back to detecting from request headers.
     */
    private String resolveOrigin(HttpServletRequest request) {
        // First check if frontendUrl is configured
        String configuredFrontendUrl = applicationProperties.getSystem().getFrontendUrl();
        if (configuredFrontendUrl != null && !configuredFrontendUrl.trim().isEmpty()) {
            return configuredFrontendUrl.trim();
        }

        // Fall back to auto-detection from request headers
        return resolveForwardedOrigin(request)
                .orElseGet(
                        () ->
                                resolveOriginFromReferer(request)
                                        .orElseGet(() -> buildOriginFromRequest(request)));
    }

    private String resolveRedirectPath(HttpServletRequest request, String contextPath) {
        if (TauriSamlUtils.isTauriRelayState(request)) {
            return TauriOAuthUtils.defaultTauriCallbackPath(contextPath);
        }
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
                URI refererUri = URI.create(referer);
                String host = refererUri.getHost();
                if (host == null) {
                    return Optional.empty();
                }
                String origin = refererUri.getScheme() + "://" + host;
                int port = refererUri.getPort();
                if (port != -1 && port != 80 && port != 443) {
                    origin += ":" + port;
                }
                return Optional.of(origin);
            } catch (IllegalArgumentException e) {
                log.debug(
                        "Malformed referer URL: {}, falling back to request-based origin", referer);
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
}
