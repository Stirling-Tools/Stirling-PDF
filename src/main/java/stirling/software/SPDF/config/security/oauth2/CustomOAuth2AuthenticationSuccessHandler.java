package stirling.software.SPDF.config.security.oauth2;

import java.io.IOException;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.SavedRequestAwareAuthenticationSuccessHandler;
import org.springframework.security.web.savedrequest.SavedRequest;
import org.springframework.stereotype.Component;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import stirling.software.SPDF.config.security.UserService;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.SPDF.model.AuthenticationType;
import stirling.software.SPDF.utils.RequestUriUtils;

@Component
public class CustomOAuth2AuthenticationSuccessHandler
        extends SavedRequestAwareAuthenticationSuccessHandler {

    ApplicationProperties applicationProperties;
    UserService userService;

    public CustomOAuth2AuthenticationSuccessHandler(
            ApplicationProperties applicationProperties, UserService userService) {
        this.applicationProperties = applicationProperties;
        this.userService = userService;
    }

    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws ServletException, IOException {

        OAuth2User oauthUser = (OAuth2User) authentication.getPrincipal();

        // Get the saved request
        HttpSession session = request.getSession(false);
        SavedRequest savedRequest =
                session != null
                        ? (SavedRequest) session.getAttribute("SPRING_SECURITY_SAVED_REQUEST")
                        : null;
        if (savedRequest != null
                && !RequestUriUtils.isStaticResource(savedRequest.getRedirectUrl())) {
            // Redirect to the original destination
            super.onAuthenticationSuccess(request, response, authentication);
        } else {
            OAUTH2 oAuth = applicationProperties.getSecurity().getOAUTH2();
            String username = oauthUser.getAttribute(oAuth.getUseAsUsername());
            if (userService.usernameExistsIgnoreCase(username)
                    && userService.hasPassword(username)
                    && !userService.isAuthenticationTypeByUsername(
                            username, AuthenticationType.OAUTH2)
                    && oAuth.getAutoCreateUser()) {
                response.sendRedirect(
                        request.getContextPath() + "/logout?oauth2AuthenticationError=true");
                return;
            } else {
                try {
                    userService.processOAuth2PostLogin(username, oAuth.getAutoCreateUser());
                    response.sendRedirect("/");
                    return;
                } catch (IllegalArgumentException e) {
                    response.sendRedirect("/logout?invalidUsername=true");
                    return;
                }
            }
        }
    }
}
