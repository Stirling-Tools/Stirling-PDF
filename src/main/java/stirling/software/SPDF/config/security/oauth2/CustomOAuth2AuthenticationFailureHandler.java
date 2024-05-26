package stirling.software.SPDF.config.security.oauth2;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

public class CustomOAuth2AuthenticationFailureHandler
        extends SimpleUrlAuthenticationFailureHandler {

    private static final Logger logger =
            LoggerFactory.getLogger(CustomOAuth2AuthenticationFailureHandler.class);

    @Override
    public void onAuthenticationFailure(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException exception)
            throws IOException, ServletException {
        if (exception instanceof OAuth2AuthenticationException) {
            OAuth2Error error = ((OAuth2AuthenticationException) exception).getError();

            String errorCode = error.getErrorCode();

            if (error.getErrorCode().equals("Password must not be null")) {
                errorCode = "userAlreadyExistsWeb";
            }
            logger.error("OAuth2 Authentication error: " + errorCode);
            getRedirectStrategy()
                    .sendRedirect(request, response, "/logout?erroroauth=" + errorCode);
            return;
        } else if (exception instanceof LockedException) {
            logger.error("Account locked: ", exception);
            getRedirectStrategy().sendRedirect(request, response, "/logout?error=locked");
            return;
        } else {
            logger.error("Unhandled authentication exception", exception);
            super.onAuthenticationFailure(request, response, exception);
        }
    }
}
