package stirling.software.SPDF.config.security;

import java.io.IOException;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;
import org.springframework.stereotype.Component;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import stirling.software.SPDF.model.User;

@Component
public class CustomAuthenticationFailureHandler extends SimpleUrlAuthenticationFailureHandler {

    @Autowired private final LoginAttemptService loginAttemptService;

    @Autowired private final UserService userService; // Inject the UserService

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
                setDefaultFailureUrl("/login?error=locked");

            } else {
                if (exception.getClass().isAssignableFrom(LockedException.class)) {
                    setDefaultFailureUrl("/login?error=locked");
                }
            }
        }
        if (exception.getClass().isAssignableFrom(BadCredentialsException.class)) {
            setDefaultFailureUrl("/login?error=badcredentials");
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
