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
            String jwt =
                    jwtService.generateToken(userName, Map.of("authType", AuthenticationType.WEB));
            log.debug("JWT generated for user: {}", userName);

            response.sendRedirect("/");
        } else {
            // Get the saved request
            HttpSession session = request.getSession(false);
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

    private String extractSavedRedirectUrl(Object savedRequest) {
        return null;
    }
}
