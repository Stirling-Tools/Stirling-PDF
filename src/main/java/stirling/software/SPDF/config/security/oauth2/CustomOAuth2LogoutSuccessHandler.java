package stirling.software.SPDF.config.security.oauth2;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.logout.SimpleUrlLogoutSuccessHandler;
import org.springframework.stereotype.Component;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2;

@Component
public class CustomOAuth2LogoutSuccessHandler extends SimpleUrlLogoutSuccessHandler {

    @Autowired SessionRegistry sessionRegistry;

    private ApplicationProperties applicationProperties;

    public CustomOAuth2LogoutSuccessHandler(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    @Override
    public void onLogoutSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException, ServletException {

        boolean isOAuthUser = true;
        String param = "logout=true";
        if (authentication == null) {
            response.sendRedirect("/");
            return;
        }
        Object pri = authentication.getPrincipal();
        if (pri instanceof UserDetails) {
            UserDetails userDetails = (UserDetails) pri;
            isOAuthUser = userDetails.getPassword() == null;
        } else if (pri instanceof OAuth2User) {
            isOAuthUser = true;
        }

        OAUTH2 oauth = applicationProperties.getSecurity().getOAUTH2();
        String provider = oauth.getProvider() != null && isOAuthUser ? oauth.getProvider() : "";

        if (request.getParameter("oauth2AuthenticationError") != null) {
            param = "error=oauth2AuthenticationError";
        } else if (request.getParameter("invalidUsername") != null) {
            param = "error=invalidUsername";
        }
        HttpSession session = request.getSession(false);
        if (session != null) {
            String sessionId = session.getId();
            sessionRegistry.removeSessionInformation(sessionId);
        }

        switch (provider) {
            case "keycloak":
                String logoutUrl =
                        oauth.getIssuer()
                                + "/protocol/openid-connect/logout"
                                + "?client_id="
                                + oauth.getClientId()
                                + "&post_logout_redirect_uri="
                                + response.encodeRedirectURL(
                                        "http://" + request.getHeader("host") + "/login?" + param);
                response.sendRedirect(logoutUrl);
                break;
            case "google":
            default:
                if (request.getParameter("oauth2AutoCreateDisabled") != null) {
                    response.sendRedirect(
                            request.getContextPath() + "/login?error=oauth2AutoCreateDisabled");
                } else {
                    response.sendRedirect(request.getContextPath() + "/login?logout=true");
                }
                break;
        }
    }
}
