package stirling.software.SPDF.config.security.saml2;

import java.io.IOException;
import java.sql.SQLException;

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

import stirling.software.SPDF.config.security.LoginAttemptService;
import stirling.software.SPDF.config.security.UserService;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.SAML2;
import stirling.software.SPDF.model.AuthenticationType;
import stirling.software.SPDF.model.exception.UnsupportedProviderException;
import stirling.software.SPDF.utils.RequestUriUtils;

@AllArgsConstructor
@Slf4j
public class CustomSaml2AuthenticationSuccessHandler
        extends SavedRequestAwareAuthenticationSuccessHandler {

    private LoginAttemptService loginAttemptService;
    private ApplicationProperties applicationProperties;
    private UserService userService;

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
                SAML2 saml2 = applicationProperties.getSecurity().getSaml2();
                log.debug(
                        "Processing SAML2 authentication with autoCreateUser: {}",
                        saml2.getAutoCreateUser());

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
                        userExists
                                && userService.isAuthenticationTypeByUsername(
                                        username, AuthenticationType.SSO);

                log.debug(
                        "User status - Exists: {}, Has password: {}, Is SSO user: {}",
                        userExists,
                        hasPassword,
                        isSSOUser);

                if (userExists && hasPassword && !isSSOUser && saml2.getAutoCreateUser()) {
                    log.debug(
                            "User {} exists with password but is not SSO user, redirecting to logout",
                            username);
                    response.sendRedirect(
                            contextPath + "/logout?oAuth2AuthenticationErrorWeb=true");
                    return;
                }

                try {
                    if (saml2.getBlockRegistration() && !userExists) {
                        log.debug("Registration blocked for new user: {}", username);
                        response.sendRedirect(
                                contextPath + "/login?errorOAuth=oAuth2AdminBlockedUser");
                        return;
                    }
                    log.debug("Processing SSO post-login for user: {}", username);
                    userService.processSSOPostLogin(username, saml2.getAutoCreateUser());
                    log.debug("Successfully processed authentication for user: {}", username);
                    response.sendRedirect(contextPath + "/");
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
}
