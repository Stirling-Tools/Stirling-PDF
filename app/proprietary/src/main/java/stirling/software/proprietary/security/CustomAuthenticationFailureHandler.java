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

// TODO: Migration required - this class extended Spring Security's
// SimpleUrlAuthenticationFailureHandler and was wired into the form-login
// SecurityFilterChain. Quarkus has no direct equivalent for an
// AuthenticationFailureHandler. The login-failure flow (lockout, bad
// credentials, oauth2 errors, disabled users) must be re-hosted on a Quarkus
// authentication mechanism - typically a custom form-auth (quarkus.http.auth.*)
// or quarkus-oidc - with the redirect decisions implemented in a
// jakarta.ws.rs.container.ContainerRequestFilter / custom HttpAuthenticationMechanism
// that inspects the AuthenticationFailedException. The decision logic below is
// preserved verbatim so it can be reused; the Spring AuthenticationException
// type hierarchy (BadCredentialsException, DisabledException, LockedException,
// UsernameNotFoundException, InternalAuthenticationServiceException) and
// getRedirectStrategy()/sendRedirect() must be replaced with the Quarkus
// equivalents. The exception parameter is currently typed as a generic
// java.lang.Throwable until the Quarkus mechanism's failure type is decided.
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

        // TODO: Migration required - replace Spring exception type checks below
        // (DisabledException, LockedException, BadCredentialsException,
        // UsernameNotFoundException, InternalAuthenticationServiceException) with
        // the Quarkus authentication-failure type(s), and replace each
        // getRedirectStrategy().sendRedirect(request, response, "...") call with
        // a Quarkus redirect (e.g. response.sendRedirect(...) or building a 302
        // jakarta.ws.rs.core.Response from the auth mechanism).

        if (isDisabled(exception)) {
            log.error("User is deactivated: ", exception);
            // TODO: Migration required - sendRedirect("/logout?userIsDisabled=true")
            return;
        }

        String ip = request.getRemoteAddr();
        log.error("Failed login attempt from IP: {}", ip);

        if (isLocked(exception)) {
            // TODO: Migration required - sendRedirect("/login?error=locked")
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
                // TODO: Migration required - sendRedirect("/login?error=locked")
                return;
            }
        }
        if (isBadCredentials(exception) || isUsernameNotFound(exception)) {
            // TODO: Migration required - sendRedirect("/login?error=badCredentials")
            return;
        }
        if (isInternalAuthError(exception)
                || "Password must not be null".equalsIgnoreCase(exception.getMessage())) {
            // TODO: Migration required - sendRedirect("/login?error=oauth2AuthenticationError")
            return;
        }

        // TODO: Migration required - default failure handling previously delegated
        // to SimpleUrlAuthenticationFailureHandler.onAuthenticationFailure (redirect
        // to the configured failure URL).
    }

    // TODO: Migration required - these predicates stand in for Spring Security's
    // exception type hierarchy and must be rewired to the Quarkus
    // authentication-failure type(s) once the auth mechanism is chosen.
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
