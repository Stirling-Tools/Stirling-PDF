package stirling.software.proprietary.security;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.InternalAuthenticationServiceException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;

@Slf4j
public class CustomAuthenticationFailureHandler extends SimpleUrlAuthenticationFailureHandler {

    private LoginAttemptService loginAttemptService;

    private UserService userService;

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

        if (exception instanceof DisabledException) {
            log.error("User is deactivated: ", exception);
            getRedirectStrategy().sendRedirect(request, response, "/logout?userIsDisabled=true");
            return;
        }

        String ip = request.getRemoteAddr();
        log.error("Failed login attempt from IP: {}", ip);

        if (exception instanceof LockedException) {
            getRedirectStrategy().sendRedirect(request, response, "/login?error=locked");
            return;
        }

        String username = request.getParameter("username");
        Optional<User> optUser = userService.findByUsernameIgnoreCase(username);

        if (username != null && optUser.isPresent() && !isDemoUser(optUser)) {
            log.info(
                    "Remaining attempts for user {}: {}",
                    username,
                    loginAttemptService.getRemainingAttempts(username));
            loginAttemptService.loginFailed(username);
            if (loginAttemptService.isBlocked(username) || exception instanceof LockedException) {
                getRedirectStrategy().sendRedirect(request, response, "/login?error=locked");
                return;
            }
        }
        if (exception instanceof BadCredentialsException
                || exception instanceof UsernameNotFoundException) {
            getRedirectStrategy().sendRedirect(request, response, "/login?error=badCredentials");
            return;
        }
        if (exception instanceof InternalAuthenticationServiceException
                || "Password must not be null".equalsIgnoreCase(exception.getMessage())) {
            getRedirectStrategy()
                    .sendRedirect(request, response, "/login?error=oauth2AuthenticationError");
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
