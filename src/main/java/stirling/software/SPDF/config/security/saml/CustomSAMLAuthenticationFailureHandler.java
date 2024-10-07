package stirling.software.SPDF.config.security.saml;

import java.io.IOException;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticationException;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class CustomSAMLAuthenticationFailureHandler extends SimpleUrlAuthenticationFailureHandler {

    @Override
    public void onAuthenticationFailure(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException exception)
            throws IOException, ServletException {

        if (exception instanceof BadCredentialsException) {
            log.error("BadCredentialsException", exception);
            getRedirectStrategy().sendRedirect(request, response, "/login?error=badcredentials");
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
        if (exception instanceof Saml2AuthenticationException) {
            log.error("SAML2 Authentication error: ", exception);
            getRedirectStrategy()
                    .sendRedirect(request, response, "/logout?error=saml2AuthenticationError");
            return;
        }
        log.error("Unhandled authentication exception", exception);
        super.onAuthenticationFailure(request, response, exception);
    }
}
