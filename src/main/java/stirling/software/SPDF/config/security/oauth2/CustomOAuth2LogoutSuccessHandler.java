package stirling.software.SPDF.config.security.oauth2;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.web.authentication.logout.SimpleUrlLogoutSuccessHandler;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.SPDF.model.Provider;
import stirling.software.SPDF.model.provider.UnsupportedProviderException;
import stirling.software.SPDF.utils.UrlUtils;

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
        String registrationId = null;
        String issuer = null;
        String clientId = null;

        OAUTH2 oauth = applicationProperties.getSecurity().getOAUTH2();

        if (authentication instanceof OAuth2AuthenticationToken) {
            OAuth2AuthenticationToken oauthToken = (OAuth2AuthenticationToken) authentication;
            registrationId = oauthToken.getAuthorizedClientRegistrationId();

            try {
                Provider provider = oauth.getClient().get(registrationId);
                issuer = provider.getIssuer();
                clientId = provider.getClientId();
            } catch (UnsupportedProviderException e) {
                logger.error(e.getMessage());
            }

        } else {
            registrationId = oauth.getProvider() != null ? oauth.getProvider() : "";
            issuer = oauth.getIssuer();
            clientId = oauth.getClientId();
        }
        String errorMessage = "";
        if (request.getParameter("oauth2AuthenticationErrorWeb") != null) {
            param = "erroroauth=oauth2AuthenticationErrorWeb";
        } else if ((errorMessage = request.getParameter("error")) != null) {
            param = "error=" + sanitizeInput(errorMessage);
        } else if ((errorMessage = request.getParameter("erroroauth")) != null) {
            param = "erroroauth=" + sanitizeInput(errorMessage);
        } else if (request.getParameter("oauth2AutoCreateDisabled") != null) {
            param = "error=oauth2AutoCreateDisabled";
        }

        String redirect_url = UrlUtils.getOrigin(request) + "/login?" + param;

        HttpSession session = request.getSession(false);
        if (session != null) {
            String sessionId = session.getId();
            sessionRegistry.removeSessionInformation(sessionId);
            session.invalidate();
            logger.info("Session invalidated: " + sessionId);
        }

        switch (registrationId.toLowerCase()) {
            case "keycloak":
                // Add Keycloak specific logout URL if needed
                String logoutUrl =
                        issuer
                                + "/protocol/openid-connect/logout"
                                + "?client_id="
                                + clientId
                                + "&post_logout_redirect_uri="
                                + response.encodeRedirectURL(redirect_url);
                logger.info("Redirecting to Keycloak logout URL: " + logoutUrl);
                response.sendRedirect(logoutUrl);
                break;
            case "github":
                // Add GitHub specific logout URL if needed
                String githubLogoutUrl = "https://github.com/logout";
                logger.info("Redirecting to GitHub logout URL: " + githubLogoutUrl);
                response.sendRedirect(githubLogoutUrl);
                break;
            case "google":
                // Add Google specific logout URL if needed
                // String googleLogoutUrl =
                // "https://accounts.google.com/Logout?continue=https://appengine.google.com/_ah/logout?continue="
                //                 + response.encodeRedirectURL(redirect_url);
                // logger.info("Redirecting to Google logout URL: " + googleLogoutUrl);
                // response.sendRedirect(googleLogoutUrl);
                // break;
            default:
                String redirectUrl = request.getContextPath() + "/login?" + param;
                logger.info("Redirecting to default logout URL: " + redirectUrl);
                response.sendRedirect(redirectUrl);
                break;
        }
    }

    private String sanitizeInput(String input) {
        return input.replaceAll("[^a-zA-Z0-9 ]", "");
    }
}
