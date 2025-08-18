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
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;

@AllArgsConstructor
@Slf4j
public class CustomSaml2AuthenticationSuccessHandler
        extends SavedRequestAwareAuthenticationSuccessHandler {

    private LoginAttemptService loginAttemptService;
    private ApplicationProperties.Security.SAML2 saml2Properties;
    private UserService userService;
    private final JwtServiceInterface jwtService;

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
                        && saml2Properties.getAutoCreateUser()) {
                    log.debug(
                            "User {} exists with password but is not SSO user, redirecting to logout",
                            username);
                    response.sendRedirect(
                            contextPath + "/logout?oAuth2AuthenticationErrorWeb=true");
                    return;
                }

                try {
                    if (!userExists || saml2Properties.getBlockRegistration()) {
                        log.debug("Registration blocked for new user: {}", username);
                        response.sendRedirect(
                                contextPath + "/login?errorOAuth=oAuth2AdminBlockedUser");
                        return;
                    }
                    log.debug("Processing SSO post-login for user: {}", username);
                    userService.processSSOPostLogin(
                            username, saml2Properties.getAutoCreateUser(), SAML2);
                    log.debug("Successfully processed authentication for user: {}", username);

                    generateJwt(response, authentication);
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

    private void generateJwt(HttpServletResponse response, Authentication authentication) {
        if (jwtService.isJwtEnabled()) {
            String jwt =
                    jwtService.generateToken(
                            authentication, Map.of("authType", AuthenticationType.SAML2));
            jwtService.addToken(response, jwt);
        }
    }
}
