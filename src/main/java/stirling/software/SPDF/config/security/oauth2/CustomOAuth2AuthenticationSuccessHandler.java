package stirling.software.SPDF.config.security.oauth2;

import java.io.IOException;
import java.sql.SQLException;

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

import stirling.software.SPDF.config.security.LoginAttemptService;
import stirling.software.SPDF.config.security.UserService;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.SPDF.model.AuthenticationType;
import stirling.software.SPDF.model.exception.UnsupportedProviderException;
import stirling.software.SPDF.utils.RequestUriUtils;

@RequiredArgsConstructor
public class CustomOAuth2AuthenticationSuccessHandler
        extends SavedRequestAwareAuthenticationSuccessHandler {

    private final LoginAttemptService loginAttemptService;
    private final ApplicationProperties applicationProperties;
    private final UserService userService;

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
            OAUTH2 oAuth = applicationProperties.getSecurity().getOauth2();

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
                    && !userService.isAuthenticationTypeByUsername(username, AuthenticationType.SSO)
                    && oAuth.getAutoCreateUser()) {
                response.sendRedirect(contextPath + "/logout?oAuth2AuthenticationErrorWeb=true");
                return;
            }

            try {
                if (oAuth.getBlockRegistration()
                        && !userService.usernameExistsIgnoreCase(username)) {
                    response.sendRedirect(contextPath + "/logout?oAuth2AdminBlockedUser=true");
                    return;
                }
                if (principal instanceof OAuth2User) {
                    userService.processSSOPostLogin(username, oAuth.getAutoCreateUser());
                }
                response.sendRedirect(contextPath + "/");
            } catch (IllegalArgumentException | SQLException | UnsupportedProviderException e) {
                response.sendRedirect(contextPath + "/logout?invalidUsername=true");
            }
        }
    }
}
