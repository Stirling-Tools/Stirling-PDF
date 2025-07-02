package stirling.software.proprietary.security;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.SavedRequestAwareAuthenticationSuccessHandler;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
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
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.JWTServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;

@Slf4j
public class CustomAuthenticationSuccessHandler
        extends SavedRequestAwareAuthenticationSuccessHandler {

    @Value("${security.jwt.enabled}")
    private boolean jwtEnabled;

    private LoginAttemptService loginAttemptService;
    private UserService userService;
    private JWTServiceInterface jwtService;

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

        if (jwtEnabled) {
            log.debug("JWT authentication enabled, generating token for user: {}", userName);
            User user = userService.findByUsername(userName).get();
            String token = jwtService.generateToken(user);
            log.debug("Generated JWT token for user: {}", userName);

            // Add JWT token to response header
            response.setHeader("Authorization", "Bearer " + token);
            log.debug("Set Authorization header with JWT token");

            // Set JWT token as a cookie as well for browser compatibility
            boolean isSecure = request.isSecure();
            String secureFlag = isSecure ? "; Secure" : "";
            String cookieValue =
                    "jwt-token=" + token + "; HttpOnly" + secureFlag + "; SameSite=Strict; Path=/";
            response.setHeader("Set-Cookie", cookieValue);
            log.debug(
                    "Set JWT cookie: isSecure={}, cookieValue={}",
                    isSecure,
                    cookieValue.substring(0, Math.min(50, cookieValue.length())));

            UsernamePasswordAuthenticationToken authenticationToken =
                    new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
            authenticationToken.setDetails(
                    new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(authenticationToken);
            log.debug("Updated SecurityContext with JWT authentication for user: {}", userName);

            // For JWT, redirect to home page
            log.debug("Redirecting to home page after JWT authentication");
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
                // Redirect to the root URL (considering context path)
                getRedirectStrategy().sendRedirect(request, response, "/");
            }
        }
    }
}
