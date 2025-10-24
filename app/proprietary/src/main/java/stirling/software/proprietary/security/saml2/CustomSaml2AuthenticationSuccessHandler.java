package stirling.software.proprietary.security.saml2;

import static stirling.software.proprietary.security.model.AuthenticationType.SAML2;
import static stirling.software.proprietary.security.model.AuthenticationType.SSO;

import java.io.IOException;
import java.sql.SQLException;
import java.util.Map;

import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.SavedRequestAwareAuthenticationSuccessHandler;
import org.springframework.security.web.savedrequest.SavedRequest;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.common.util.RequestUriUtils;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;

@AllArgsConstructor
@Slf4j
public class CustomSaml2AuthenticationSuccessHandler
        extends SavedRequestAwareAuthenticationSuccessHandler {

    private final ApplicationProperties applicationProperties;
    private LoginAttemptService loginAttemptService;
    private UserService userService;
    private final JwtServiceInterface jwtService;

    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws ServletException, IOException {

        Object principal = authentication.getPrincipal();
        log.debug("Starting SAML2 authentication success handling");

        if (principal instanceof CustomSaml2AuthenticatedPrincipal saml2Principal) {
            String username = saml2Principal.name();
            log.debug("Authenticated principal found for user: {}", username);

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
                        applicationProperties.getSecurity().getSaml2().getAutoCreateUser());

                if (loginAttemptService.isBlocked(username)) {
                    log.debug("User {} is blocked due to too many login attempts", username);
                    if (session != null) {
                        session.removeAttribute("SPRING_SECURITY_SAVED_REQUEST");
                    }
                    throw new LockedException(
                            "Your account has been locked due to too many failed login attempts.");
                }

                boolean userExists = userService.usernameExistsIgnoreCase(username);
                boolean hasPassword = userExists && userService.hasPassword(username);
                boolean isSSOUser =
                        userExists && userService.isAuthenticationTypeByUsername(username, SSO);
                boolean isSAML2User =
                        userExists && userService.isAuthenticationTypeByUsername(username, SAML2);

                log.debug(
                        "User status - Exists: {}, Has password: {}, Is SSO user: {}, Is SAML2 user: {}",
                        userExists,
                        hasPassword,
                        isSSOUser,
                        isSAML2User);

                if (userExists
                        && hasPassword
                        && (!isSSOUser || !isSAML2User)
                        && applicationProperties.getSecurity().getSaml2().getAutoCreateUser()) {
                    log.debug(
                            "User {} exists with password but is not SSO user, redirecting to logout",
                            username);
                    response.sendRedirect(
                            contextPath + "/logout?oAuth2AuthenticationErrorWeb=true");
                    return;
                }

                try {
                    if (!userExists
                            || applicationProperties
                                    .getSecurity()
                                    .getSaml2()
                                    .getBlockRegistration()) {
                        log.debug("Registration blocked for new user: {}", username);
                        response.sendRedirect(
                                contextPath + "/login?errorOAuth=oAuth2AdminBlockedUser");
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
                            applicationProperties.getSecurity().getSaml2().getAutoCreateUser(),
                            SAML2);
                    log.debug("Successfully processed authentication for user: {}", username);

                    // Generate JWT if v2 is enabled
                    if (jwtService.isJwtEnabled()) {
                        String jwt =
                                jwtService.generateToken(
                                        authentication,
                                        Map.of("authType", AuthenticationType.SAML2));

                        // Set JWT as HttpOnly cookie for security
                        jwtService.setJwtCookie(response, jwt, contextPath);

                        // Build context-aware redirect URL (without JWT in URL)
                        String redirectUrl = buildContextAwareRedirectUrl(request, contextPath);

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
     * Builds a context-aware redirect URL based on the request's origin Validates Referer against
     * CORS whitelist to prevent token leakage to third parties
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
                    log.debug("Using whitelisted Referer origin for redirect: {}", origin);
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
