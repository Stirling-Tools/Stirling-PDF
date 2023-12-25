package stirling.software.SPDF.config.security;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;
import org.springframework.stereotype.Component;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
@Component
public class CustomAuthenticationFailureHandler extends SimpleUrlAuthenticationFailureHandler {
	
	@Autowired
	private final LoginAttemptService loginAttemptService;

    @Autowired
    public CustomAuthenticationFailureHandler(LoginAttemptService loginAttemptService) {
        this.loginAttemptService = loginAttemptService;
    }
	
    @Override
    public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response, AuthenticationException exception) 
      throws IOException, ServletException {
    	String ip = request.getRemoteAddr();
        logger.error("Failed login attempt from IP: " + ip);
        
        String username = request.getParameter("username");
        if(loginAttemptService.loginAttemptCheck(username)) {
        	setDefaultFailureUrl("/login?error=locked");
        	
        } else {
	        if (exception.getClass().isAssignableFrom(BadCredentialsException.class)) {
	        	setDefaultFailureUrl("/login?error=badcredentials");
	        } else if (exception.getClass().isAssignableFrom(LockedException.class)) {
	        	setDefaultFailureUrl("/login?error=locked");
	        }
        }
        
        
        super.onAuthenticationFailure(request, response, exception);
    }
}
