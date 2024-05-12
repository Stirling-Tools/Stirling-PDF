package stirling.software.SPDF.config.security;

import java.io.IOException;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;
import org.springframework.stereotype.Component;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import stirling.software.SPDF.model.User;

@Component
public class CustomAuthenticationFailureHandler extends SimpleUrlAuthenticationFailureHandler {

    private LoginAttemptService loginAttemptService;

    private UserService userService;

    private static final Logger logger =
            LoggerFactory.getLogger(CustomAuthenticationFailureHandler.class);

    public CustomAuthenticationFailureHandler(
            LoginAttemptService loginAttemptService, UserService userService) {
        this.loginAttemptService = loginAttemptService;
        this.userService = userService;
    }

    @Override
    public void onAuthenticationFailure(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException exception)
            throws IOException, ServletException {

        String ip = request.getRemoteAddr();
        logger.error("Failed login attempt from IP: " + ip);

        String username = request.getParameter("username");
        if (!isDemoUser(username)) {
            if (loginAttemptService.loginAttemptCheck(username)) {
                response.sendRedirect("/login?error=locked");
                return;
            } else {
                if (exception.getClass().isAssignableFrom(LockedException.class)) {
                    response.sendRedirect("/login?error=locked");
                    return;
                } else if (exception instanceof UsernameNotFoundException) {
                    response.sendRedirect("/login?error=oauth2AuthenticationError");
                    return;
                }
            }
        }
        if (exception.getClass().isAssignableFrom(BadCredentialsException.class)) {
            response.sendRedirect("/login?error=badcredentials");
            return;
        }

        super.onAuthenticationFailure(request, response, exception);
    }

    private boolean isDemoUser(String username) {
        Optional<User> user = userService.findByUsernameIgnoreCase(username);
        return user.isPresent()
                && user.get().getAuthorities().stream()
                        .anyMatch(authority -> "ROLE_DEMO_USER".equals(authority.getAuthority()));
    }
}
