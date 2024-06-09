package stirling.software.SPDF.config.security;

import java.io.IOException;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.InternalAuthenticationServiceException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import stirling.software.SPDF.model.User;

public class CustomAuthenticationFailureHandler extends SimpleUrlAuthenticationFailureHandler {

    private LoginAttemptService loginAttemptService;

    private UserService userService;

    private static final Logger logger =
            LoggerFactory.getLogger(CustomAuthenticationFailureHandler.class);

    public CustomAuthenticationFailureHandler(
            final LoginAttemptService loginAttemptService, UserService userService) {
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
        logger.error("Failed login attempt from IP: {}", ip);

        String contextPath = request.getContextPath();

        if (exception.getClass().isAssignableFrom(InternalAuthenticationServiceException.class)
                || "Password must not be null".equalsIgnoreCase(exception.getMessage())) {
            response.sendRedirect(contextPath + "/login?error=oauth2AuthenticationError");
            return;
        }

        String username = request.getParameter("username");
        Optional<User> optUser = userService.findByUsernameIgnoreCase(username);

        if (username != null && optUser.isPresent() && !isDemoUser(optUser)) {
            logger.info(
                    "Remaining attempts for user {}: {}",
                    optUser.get().getUsername(),
                    loginAttemptService.getRemainingAttempts(username));
            loginAttemptService.loginFailed(username);
            if (loginAttemptService.isBlocked(username)
                    || exception.getClass().isAssignableFrom(LockedException.class)) {
                response.sendRedirect(contextPath + "/login?error=locked");
                return;
            }
        }
        if (exception.getClass().isAssignableFrom(BadCredentialsException.class)
                || exception.getClass().isAssignableFrom(UsernameNotFoundException.class)) {
            response.sendRedirect(contextPath + "/login?error=badcredentials");
            return;
        }

        super.onAuthenticationFailure(request, response, exception);
    }

    private boolean isDemoUser(Optional<User> user) {
        return user.isPresent()
                && user.get().getAuthorities().stream()
                        .anyMatch(authority -> "ROLE_DEMO_USER".equals(authority.getAuthority()));
    }
}
