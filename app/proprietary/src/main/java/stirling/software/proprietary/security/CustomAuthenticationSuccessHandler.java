package stirling.software.proprietary.security;

import java.io.IOException;
import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.SavedRequestAwareAuthenticationSuccessHandler;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.util.CookieUtils;

@Slf4j
public class CustomAuthenticationSuccessHandler
        extends SavedRequestAwareAuthenticationSuccessHandler {

    private final LoginAttemptService loginAttemptService;
    private final UserService userService;
    private final JwtServiceInterface jwtService;
    private final ApplicationProperties.Security securityProperties;

    public CustomAuthenticationSuccessHandler(
            LoginAttemptService loginAttemptService,
            UserService userService,
            JwtServiceInterface jwtService,
            ApplicationProperties.Security securityProperties) {
        this.loginAttemptService = loginAttemptService;
        this.userService = userService;
        this.jwtService = jwtService;
        this.securityProperties = securityProperties;
    }

    @Override
    @Audited(type = AuditEventType.USER_LOGIN, level = AuditLevel.BASIC)
    public void onAuthenticationSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException {

        String userName = request.getParameter("username");
        if (userService.isUserDisabled(userName)) {
            getRedirectStrategy().sendRedirect(request, response, "/logout?userIsDisabled=true");
            return;
        }
        loginAttemptService.loginSucceeded(userName);

        String jwt =
                jwtService.generateToken(
                        authentication, Map.of("authType", AuthenticationType.WEB));
        boolean secure = securityProperties.getJwt().isSecure();

        response.addHeader(
                HttpHeaders.SET_COOKIE,
                CookieUtils.createAccessTokenCookie(jwt, secure).toString());

        log.debug("JWT generated for user: {}", userName);

        getRedirectStrategy().sendRedirect(request, response, "/");
    }
}
