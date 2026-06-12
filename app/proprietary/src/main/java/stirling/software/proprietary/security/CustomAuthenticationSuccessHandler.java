package stirling.software.proprietary.security;

import java.io.IOException;
import java.util.Map;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.RequestUriUtils;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;

// TODO: Migration required - this class previously extended Spring Security's
// SavedRequestAwareAuthenticationSuccessHandler, which is part of the Spring Security
// form-login filter chain (RedirectStrategy + SavedRequest from the HttpSession). Quarkus
// has no direct equivalent: post-login redirects are handled by quarkus-oidc / form-auth
// (quarkus.http.auth.form.landing-page, .location-cookie) or by a custom
// jakarta.servlet.Filter / ContainerRequestFilter / HttpAuthenticationMechanism. The
// business logic below (disabled-user check, login-attempt tracking, JWT minting, and the
// static-resource redirect decision) is preserved and should be invoked from whatever
// Quarkus authentication-success hook replaces this handler. The Spring
// SavedRequestAwareAuthenticationSuccessHandler super.onAuthenticationSuccess(...) call and
// getRedirectStrategy() have been replaced with plain HttpServletResponse#sendRedirect.
//
// TODO: Migration required - the @Audited(USER_LOGIN) interception relied on the Spring AOP
// AuditAspect wrapping this Spring-managed handler bean. Ensure the migrated AuditAspect
// (CDI interceptor) still binds to this method, or audit the login event from the new
// authentication-success hook.
@Slf4j
@ApplicationScoped
public class CustomAuthenticationSuccessHandler {

    private final LoginAttemptService loginAttemptService;
    private final UserService userService;
    private final JwtServiceInterface jwtService;

    @Inject
    public CustomAuthenticationSuccessHandler(
            LoginAttemptService loginAttemptService,
            UserService userService,
            JwtServiceInterface jwtService) {
        this.loginAttemptService = loginAttemptService;
        this.userService = userService;
        this.jwtService = jwtService;
    }

    // TODO: Migration required - signature changed from Spring's
    // onAuthenticationSuccess(HttpServletRequest, HttpServletResponse,
    // org.springframework.security.core.Authentication). The Spring Authentication parameter
    // has been dropped here; JwtServiceInterface#generateToken(Authentication, ...) still
    // requires it (JwtServiceInterface is a separate file that must be migrated to accept a
    // Quarkus SecurityIdentity / principal). For now the username is read from the request
    // parameter as before; wire the authenticated identity in once JwtServiceInterface is
    // migrated.
    @Audited(type = AuditEventType.USER_LOGIN, level = AuditLevel.BASIC)
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {

        String userName = request.getParameter("username");
        if (userService.isUserDisabled(userName)) {
            response.sendRedirect("/logout?userIsDisabled=true");
            return;
        }
        loginAttemptService.loginSucceeded(userName);

        if (jwtService.isJwtEnabled()) {
            // TODO: Migration required - JwtServiceInterface#generateToken expected a Spring
            // Authentication. Pass the migrated Quarkus identity once JwtServiceInterface is
            // ported; generating the token by username for now.
            String jwt =
                    jwtService.generateToken(userName, Map.of("authType", AuthenticationType.WEB));
            log.debug("JWT generated for user: {}", userName);

            response.sendRedirect("/");
        } else {
            // Get the saved request
            HttpSession session = request.getSession(false);
            // TODO: Migration required - "SPRING_SECURITY_SAVED_REQUEST" was populated by the
            // Spring Security RequestCache. Without the Spring filter chain this attribute is
            // never set, so this branch always falls through to the home-page redirect. The
            // original-destination redirect must be reimplemented via the Quarkus form-auth
            // location cookie or a custom request cache.
            Object savedRequest =
                    (session != null)
                            ? session.getAttribute("SPRING_SECURITY_SAVED_REQUEST")
                            : null;

            String savedRedirectUrl = extractSavedRedirectUrl(savedRequest);
            if (savedRedirectUrl != null
                    && !RequestUriUtils.isStaticResource(
                            request.getContextPath(), savedRedirectUrl)) {
                // Redirect to the original destination
                response.sendRedirect(savedRedirectUrl);
            } else {
                // No saved request or it's a static resource, redirect to home page
                response.sendRedirect("/");
            }
        }
    }

    // TODO: Migration required - placeholder for reading the redirect URL off whatever object
    // the migrated request cache stores. The Spring SavedRequest#getRedirectUrl() is gone.
    private String extractSavedRedirectUrl(Object savedRequest) {
        return null;
    }
}
