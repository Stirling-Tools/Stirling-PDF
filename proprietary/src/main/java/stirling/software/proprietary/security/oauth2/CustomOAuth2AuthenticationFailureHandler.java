<<<<<<<< HEAD:proprietary/src/main/java/stirling/software/proprietary/security/oauth2/CustomOAuth2AuthenticationFailureHandler.java
package stirling.software.proprietary.security.oauth2;
========
package stirling.software.enterprise.security.oauth2;
>>>>>>>> f833293d (renaming module):enterprise/src/main/java/stirling/software/enterprise/security/oauth2/CustomOAuth2AuthenticationFailureHandler.java

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;

@Slf4j
public class CustomOAuth2AuthenticationFailureHandler
        extends SimpleUrlAuthenticationFailureHandler {

    @Override
    public void onAuthenticationFailure(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException exception)
            throws IOException, ServletException {

        if (exception instanceof BadCredentialsException) {
            log.error("BadCredentialsException", exception);
            getRedirectStrategy().sendRedirect(request, response, "/login?error=badCredentials");
            return;
        }
        if (exception instanceof DisabledException) {
            log.error("User is deactivated: ", exception);
            getRedirectStrategy().sendRedirect(request, response, "/logout?userIsDisabled=true");
            return;
        }
        if (exception instanceof LockedException) {
            log.error("Account locked: ", exception);
            getRedirectStrategy().sendRedirect(request, response, "/logout?error=locked");
            return;
        }
        if (exception instanceof OAuth2AuthenticationException oAuth2Exception) {
            OAuth2Error error = oAuth2Exception.getError();

            String errorCode = error.getErrorCode();

            if ("Password must not be null".equals(error.getErrorCode())) {
                errorCode = "userAlreadyExistsWeb";
            }

            log.error(
                    "OAuth2 Authentication error: {}",
                    errorCode != null ? errorCode : exception.getMessage(),
                    exception);
            getRedirectStrategy().sendRedirect(request, response, "/login?errorOAuth=" + errorCode);
        }
        log.error("Unhandled authentication exception", exception);
        super.onAuthenticationFailure(request, response, exception);
    }
}
