package stirling.software.SPDF.config.security.oauth2;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.web.authentication.logout.SimpleUrlLogoutSuccessHandler;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2;

public class CustomOAuth2LogoutSuccessHandler extends SimpleUrlLogoutSuccessHandler {

    private static final Logger logger =
            LoggerFactory.getLogger(CustomOAuth2LogoutSuccessHandler.class);

    private final SessionRegistry sessionRegistry;
    private final ApplicationProperties applicationProperties;

    public CustomOAuth2LogoutSuccessHandler(
            ApplicationProperties applicationProperties, SessionRegistry sessionRegistry) {
        this.sessionRegistry = sessionRegistry;
        this.applicationProperties = applicationProperties;
    }

    @Override
    public void onLogoutSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException, ServletException {

        String param = "logout=true";

        OAUTH2 oauth = applicationProperties.getSecurity().getOAUTH2();
        String provider = oauth.getProvider() != null ? oauth.getProvider() : "";

        if (request.getParameter("oauth2AuthenticationErrorWeb") != null) {
            param = "erroroauth=oauth2AuthenticationErrorWeb";
        } else if (request.getParameter("error") != null) {
            param = "error=" + request.getParameter("error");
        } else if (request.getParameter("erroroauth") != null) {
            param = "erroroauth=" + request.getParameter("erroroauth");
        } else if (request.getParameter("oauth2AutoCreateDisabled") != null) {
            param = "error=oauth2AutoCreateDisabled";
        }

        HttpSession session = request.getSession(false);
        if (session != null) {
            String sessionId = session.getId();
            sessionRegistry.removeSessionInformation(sessionId);
            session.invalidate();
            logger.debug("Session invalidated: " + sessionId);
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
                                        request.getScheme()
                                                + "://"
                                                + request.getHeader("host")
                                                + "/login?"
                                                + param);
                logger.debug("Redirecting to Keycloak logout URL: " + logoutUrl);
                response.sendRedirect(logoutUrl);
                break;
            case "google":
                // Add Google specific logout URL if needed
            default:
                String redirectUrl = request.getContextPath() + "/login?" + param;
                logger.debug("Redirecting to default logout URL: " + redirectUrl);
                response.sendRedirect(redirectUrl);
                break;
        }
    }
}
