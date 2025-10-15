package stirling.software.proprietary.security.oauth2;

import static stirling.software.proprietary.security.model.AuthenticationType.OAUTH2;
import static stirling.software.proprietary.security.model.AuthenticationType.SSO;

import java.io.IOException;
import java.sql.SQLException;
import java.util.Map;

import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
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
            if (jwtService.isJwtEnabled()) {
                String jwt =
                        jwtService.generateToken(
                                authentication, Map.of("authType", AuthenticationType.OAUTH2));
                jwtService.addToken(response, jwt);
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
                if (principal instanceof OAuth2User) {
                    userService.processSSOPostLogin(
                            username, oauth2Properties.getAutoCreateUser(), OAUTH2);
                }
                response.sendRedirect(contextPath + "/");
            } catch (IllegalArgumentException | SQLException | UnsupportedProviderException e) {
                response.sendRedirect(contextPath + "/logout?invalidUsername=true");
            }
        }
    }
}
