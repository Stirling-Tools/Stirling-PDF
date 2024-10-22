package stirling.software.SPDF.config.security.saml2;

import java.io.IOException;

import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.SavedRequestAwareAuthenticationSuccessHandler;
import org.springframework.security.web.savedrequest.SavedRequest;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.AllArgsConstructor;
import stirling.software.SPDF.config.security.LoginAttemptService;
import stirling.software.SPDF.config.security.UserService;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.SAML2;
import stirling.software.SPDF.model.AuthenticationType;
import stirling.software.SPDF.utils.RequestUriUtils;

@AllArgsConstructor
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

        if (principal instanceof CustomSaml2AuthenticatedPrincipal) {
            String username = ((CustomSaml2AuthenticatedPrincipal) principal).getName();
            // Get the saved request
            HttpSession session = request.getSession(false);
            String contextPath = request.getContextPath();
            SavedRequest savedRequest =
                    (session != null)
                            ? (SavedRequest) session.getAttribute("SPRING_SECURITY_SAVED_REQUEST")
                            : null;

            if (savedRequest != null
                    && !RequestUriUtils.isStaticResource(
                            contextPath, savedRequest.getRedirectUrl())) {
                // Redirect to the original destination
                super.onAuthenticationSuccess(request, response, authentication);
            } else {
                SAML2 saml2 = applicationProperties.getSecurity().getSaml2();

                if (loginAttemptService.isBlocked(username)) {
                    if (session != null) {
                        session.removeAttribute("SPRING_SECURITY_SAVED_REQUEST");
                    }
                    throw new LockedException(
                            "Your account has been locked due to too many failed login attempts.");
                }
                if (userService.usernameExistsIgnoreCase(username)
                        && userService.hasPassword(username)
                        && !userService.isAuthenticationTypeByUsername(
                                username, AuthenticationType.OAUTH2)
                        && saml2.getAutoCreateUser()) {
                    response.sendRedirect(
                            contextPath + "/logout?oauth2AuthenticationErrorWeb=true");
                    return;
                }
                try {
                    if (saml2.getBlockRegistration()
                            && !userService.usernameExistsIgnoreCase(username)) {
                        response.sendRedirect(
                                contextPath + "/login?erroroauth=oauth2_admin_blocked_user");
                        return;
                    }
                    userService.processOAuth2PostLogin(username, saml2.getAutoCreateUser());
                    response.sendRedirect(contextPath + "/");
                    return;
                } catch (IllegalArgumentException e) {
                    response.sendRedirect(contextPath + "/logout?invalidUsername=true");
                    return;
                }
            }
        } else {
            super.onAuthenticationSuccess(request, response, authentication);
        }
    }
}
