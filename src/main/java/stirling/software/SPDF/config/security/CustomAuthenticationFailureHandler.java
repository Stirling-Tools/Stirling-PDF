package stirling.software.SPDF.config.security;

import java.io.IOException;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

public class CustomAuthenticationFailureHandler extends SimpleUrlAuthenticationFailureHandler {

    @Override
    public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response, AuthenticationException exception) 
      throws IOException, ServletException {
    	String ip = request.getRemoteAddr();
        logger.error("Failed login attempt from IP: " + ip);
        if (exception.getClass().isAssignableFrom(BadCredentialsException.class)) {
        	setDefaultFailureUrl("/login?error=badcredentials");
        } else if (exception.getClass().isAssignableFrom(LockedException.class)) {
        	setDefaultFailureUrl("/login?error=locked");
        }
        super.onAuthenticationFailure(request, response, exception);
    }
}
