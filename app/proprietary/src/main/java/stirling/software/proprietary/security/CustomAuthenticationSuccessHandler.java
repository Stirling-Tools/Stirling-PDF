package stirling.software.proprietary.security;

import java.io.IOException;
import java.util.Map;

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
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;

@Slf4j
public class CustomAuthenticationSuccessHandler
        extends SavedRequestAwareAuthenticationSuccessHandler {

    private final LoginAttemptService loginAttemptService;
    private final UserService userService;
    private final JwtServiceInterface jwtService;

    public CustomAuthenticationSuccessHandler(
            LoginAttemptService loginAttemptService,
            UserService userService,
            JwtServiceInterface jwtService) {
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

        if (jwtService.isJwtEnabled()) {
            String jwt =
                    jwtService.generateToken(
                            authentication, Map.of("authType", AuthenticationType.WEB));
            jwtService.addToken(response, jwt);
            log.debug("JWT generated for user: {}", userName);

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
            } else {
                // No saved request or it's a static resource, redirect to home page
                getRedirectStrategy().sendRedirect(request, response, "/");
            }
        }
    }
}
