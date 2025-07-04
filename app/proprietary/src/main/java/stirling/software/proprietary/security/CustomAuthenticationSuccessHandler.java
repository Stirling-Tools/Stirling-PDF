package stirling.software.proprietary.security;

import java.io.IOException;

import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.SavedRequestAwareAuthenticationSuccessHandler;
import org.springframework.security.web.savedrequest.SavedRequest;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.RequestUriUtils;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.security.service.JWTServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;

@Slf4j
public class CustomAuthenticationSuccessHandler
        extends SavedRequestAwareAuthenticationSuccessHandler {

    private final LoginAttemptService loginAttemptService;
    private final UserService userService;
    private final JWTServiceInterface jwtService;

    public CustomAuthenticationSuccessHandler(
            LoginAttemptService loginAttemptService,
            UserService userService,
            JWTServiceInterface jwtService) {
        this.loginAttemptService = loginAttemptService;
        this.userService = userService;
        this.jwtService = jwtService;
    }

    @Override
    @Audited(type = AuditEventType.USER_LOGIN, level = AuditLevel.BASIC)
    public void onAuthenticationSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws ServletException, IOException {

        String userName = request.getParameter("username");
        if (userService.isUserDisabled(userName)) {
            getRedirectStrategy().sendRedirect(request, response, "/logout?userIsDisabled=true");
            return;
        }
        loginAttemptService.loginSucceeded(userName);

        // Generate JWT token if JWT authentication is enabled
        boolean jwtEnabled = jwtService.isJwtEnabled();
        if (jwtEnabled) {
            try {
                String jwt = jwtService.generateToken(authentication);
                jwtService.addTokenToResponse(response, jwt);
                log.debug("JWT generated for user: {}", userName);
            } catch (Exception e) {
                log.error("Failed to generate JWT token for user: {}", userName, e);
            }
        }

        if (jwtEnabled) {
            // JWT mode: stateless authentication, redirect after setting token
            getRedirectStrategy().sendRedirect(request, response, "/");
        } else {
            // Get the saved request
            HttpSession session = request.getSession(false);
            SavedRequest savedRequest =
                    (session != null)
                            ? (SavedRequest) session.getAttribute("SPRING_SECURITY_SAVED_REQUEST")
                            : null;

            if (savedRequest != null
                    && !RequestUriUtils.isStaticResource(
                            request.getContextPath(), savedRequest.getRedirectUrl())) {
                // Redirect to the original destination
                super.onAuthenticationSuccess(request, response, authentication);
            }
        }
    }
}
