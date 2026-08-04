package stirling.software.proprietary.security;

import java.io.IOException;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;

@Slf4j
@ApplicationScoped
public class CustomAuthenticationFailureHandler {

    private LoginAttemptService loginAttemptService;

    private UserService userService;

    @Inject
    public CustomAuthenticationFailureHandler(
            final LoginAttemptService loginAttemptService, UserService userService) {
        this.loginAttemptService = loginAttemptService;
        this.userService = userService;
    }

    @Audited(type = AuditEventType.USER_FAILED_LOGIN, level = AuditLevel.BASIC)
    public void onAuthenticationFailure(
            HttpServletRequest request, HttpServletResponse response, Throwable exception)
            throws IOException, ServletException {

        if (isDisabled(exception)) {
            log.error("User is deactivated: ", exception);
            return;
        }

        String ip = request.getRemoteAddr();
        log.error("Failed login attempt from IP: {}", ip);

        if (isLocked(exception)) {
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
            if (loginAttemptService.isBlocked(username) || isLocked(exception)) {
                return;
            }
        }
        if (isBadCredentials(exception) || isUsernameNotFound(exception)) {
            return;
        }
        if (isInternalAuthError(exception)
                || "Password must not be null".equalsIgnoreCase(exception.getMessage())) {
            return;
        }
    }

    private boolean isDisabled(Throwable exception) {
        return false;
    }

    private boolean isLocked(Throwable exception) {
        return false;
    }

    private boolean isBadCredentials(Throwable exception) {
        return false;
    }

    private boolean isUsernameNotFound(Throwable exception) {
        return false;
    }

    private boolean isInternalAuthError(Throwable exception) {
        return false;
    }

    private boolean isDemoUser(Optional<User> user) {
        return user.isPresent()
                && user.get().getAuthorities().stream()
                        .anyMatch(authority -> "ROLE_DEMO_USER".equals(authority.getAuthority()));
    }
}
