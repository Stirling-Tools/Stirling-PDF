package stirling.software.SPDF.config.security.oauth2;

import java.io.IOException;

import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;
import org.springframework.stereotype.Component;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class CustomOAuth2AuthenticationFailureHandler
        extends SimpleUrlAuthenticationFailureHandler {

    @Override
    public void onAuthenticationFailure(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException exception)
            throws IOException, ServletException {
        if (exception instanceof OAuth2AuthenticationException) {
            OAuth2Error error = ((OAuth2AuthenticationException) exception).getError();
            getRedirectStrategy()
                    .sendRedirect(request, response, "/login?error=oAuth::" + error.getErrorCode());
        } else if (exception instanceof LockedException) {
            getRedirectStrategy().sendRedirect(request, response, "/login?error=locked");
        } else if (exception instanceof UsernameNotFoundException) {
            getRedirectStrategy()
                    .sendRedirect(request, response, "/login?error=oauth2AuthenticationError");
        } else {
            super.onAuthenticationFailure(request, response, exception);
        }
    }
}
