package stirling.software.SPDF.config.security.saml2;

import java.io.IOException;

import org.springframework.security.authentication.ProviderNotFoundException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.saml2.core.Saml2Error;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticationException;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class CustomSaml2AuthenticationFailureHandler extends SimpleUrlAuthenticationFailureHandler {

	@Override
	public void onAuthenticationFailure(
	        HttpServletRequest request,
	        HttpServletResponse response,
	        AuthenticationException exception)
	        throws IOException, ServletException {

	    if (exception instanceof Saml2AuthenticationException saml2Exception) {
	        Saml2Error error = saml2Exception.getSaml2Error();

	        // Log detailed information about the SAML error
	        log.error("SAML Authentication failed with error code: {}", error.getErrorCode());
	        log.error("Error description: {}", error.getDescription());

	        // Redirect to login with specific error code
	        getRedirectStrategy()
	                .sendRedirect(request, response, "/login?erroroauth=" + error.getErrorCode());
	    } else if (exception instanceof ProviderNotFoundException) {
	        log.error("Authentication failed: No authentication provider found");

	        getRedirectStrategy()
	                .sendRedirect(
	                        request,
	                        response,
	                        "/login?erroroauth=not_authentication_provider_found");
	    } else {
	        log.error("Unknown AuthenticationException: {}", exception.getMessage());
	        getRedirectStrategy().sendRedirect(request, response, "/login?erroroauth=unknown_error");
	    }
	}

}
