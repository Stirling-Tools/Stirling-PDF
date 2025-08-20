package stirling.software.proprietary.security.filter;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.common.model.ApplicationProperties.Security.SAML2;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;

@Slf4j
@Component
public class UserAuthenticationFilter extends OncePerRequestFilter {

    private final ApplicationProperties.Security securityProp;
    private final UserService userService;
    private final SessionPersistentRegistry sessionPersistentRegistry;
    private final boolean loginEnabledValue;

    public UserAuthenticationFilter(
            @Lazy ApplicationProperties.Security securityProp,
            @Lazy UserService userService,
            SessionPersistentRegistry sessionPersistentRegistry,
            @Qualifier("loginEnabled") boolean loginEnabledValue) {
        this.securityProp = securityProp;
        this.userService = userService;
        this.sessionPersistentRegistry = sessionPersistentRegistry;
        this.loginEnabledValue = loginEnabledValue;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        if (!loginEnabledValue) {
            // If login is not enabled, just pass all requests without authentication
            filterChain.doFilter(request, response);
            return;
        }
        String requestURI = request.getRequestURI();

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        // Check for session expiration (unsure if needed)
        //        if (authentication != null && authentication.isAuthenticated()) {
        //            String sessionId = request.getSession().getId();
        //            SessionInformation sessionInfo =
        //                    sessionPersistentRegistry.getSessionInformation(sessionId);
        //
        //            if (sessionInfo != null && sessionInfo.isExpired()) {
        //                SecurityContextHolder.clearContext();
        //                response.sendRedirect(request.getContextPath() + "/login?expired=true");
        //                return;
        //            }
        //        }

        // Check for API key in the request headers if no authentication exists
        if (authentication == null || !authentication.isAuthenticated()) {
            String apiKey = request.getHeader("X-API-KEY");
            if (apiKey != null && !apiKey.trim().isEmpty()) {
                try {
                    // Use API key to authenticate. This requires you to have an authentication
                    // provider for API keys.
                    Optional<User> user = userService.getUserByApiKey(apiKey);
                    if (user.isEmpty()) {
                        response.setStatus(HttpStatus.UNAUTHORIZED.value());
                        response.getWriter().write("Invalid API Key.");
                        return;
                    }
                    authentication =
                            new ApiKeyAuthenticationToken(
                                    user.get(), apiKey, user.get().getAuthorities());
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                } catch (AuthenticationException e) {
                    // If API key authentication fails, deny the request
                    response.setStatus(HttpStatus.UNAUTHORIZED.value());
                    response.getWriter().write("Invalid API Key.");
                    return;
                }
            }
        }

        // If we still don't have any authentication, deny the request
        if (authentication == null || !authentication.isAuthenticated()) {
            String method = request.getMethod();
            String contextPath = request.getContextPath();

            if ("GET".equalsIgnoreCase(method) && !requestURI.startsWith(contextPath + "/login")) {
                response.sendRedirect(contextPath + "/login"); // redirect to the login page
            } else {
                response.setStatus(HttpStatus.UNAUTHORIZED.value());
                response.getWriter()
                        .write(
                                """
                                Authentication required. Please provide a X-API-KEY in request header.
                                This is found in Settings -> Account Settings -> API Key
                                Alternatively you can disable authentication if this is unexpected.
                                """);
            }
            return;
        }

        // Check if the authenticated user is disabled and invalidate their session if so
        if (authentication != null && authentication.isAuthenticated()) {

            UserLoginType loginMethod = UserLoginType.UNKNOWN;

            boolean blockRegistration = false;

            // Extract username and determine the login method
            Object principal = authentication.getPrincipal();
            String username = null;
            if (principal instanceof UserDetails detailsUser) {
                username = detailsUser.getUsername();
                loginMethod = UserLoginType.USERDETAILS;
            } else if (principal instanceof OAuth2User oAuth2User) {
                username = oAuth2User.getName();
                loginMethod = UserLoginType.OAUTH2USER;
                OAUTH2 oAuth = securityProp.getOauth2();
                blockRegistration = oAuth != null && oAuth.getBlockRegistration();
            } else if (principal instanceof CustomSaml2AuthenticatedPrincipal saml2User) {
                username = saml2User.name();
                loginMethod = UserLoginType.SAML2USER;
                SAML2 saml2 = securityProp.getSaml2();
                blockRegistration = saml2 != null && saml2.getBlockRegistration();
            } else if (principal instanceof String stringUser) {
                username = stringUser;
                loginMethod = UserLoginType.STRINGUSER;
            }

            // Retrieve all active sessions for the user
            List<SessionInformation> sessionsInformations =
                    sessionPersistentRegistry.getAllSessions(principal, false);

            // Check if the user exists, is disabled, or needs session invalidation
            if (username != null) {
                log.debug("Validating user: {}", username);
                boolean isUserExists = userService.usernameExistsIgnoreCase(username);
                boolean isUserDisabled = userService.isUserDisabled(username);

                boolean notSsoLogin =
                        !UserLoginType.OAUTH2USER.equals(loginMethod)
                                && !UserLoginType.SAML2USER.equals(loginMethod);

                // Block user registration if not allowed by configuration
                if (blockRegistration && !isUserExists) {
                    log.warn("Blocked registration for OAuth2/SAML user: {}", username);
                    response.sendRedirect(
                            request.getContextPath() + "/logout?oAuth2AdminBlockedUser=true");
                    return;
                }

                // Expire sessions and logout if the user does not exist or is disabled
                if (!isUserExists || isUserDisabled) {
                    log.info(
                            "Invalidating session for disabled or non-existent user: {}", username);
                    for (SessionInformation sessionsInformation : sessionsInformations) {
                        sessionsInformation.expireNow();
                        sessionPersistentRegistry.expireSession(sessionsInformation.getSessionId());
                    }
                }

                // Redirect to logout if credentials are invalid
                if (!isUserExists && notSsoLogin) {
                    response.sendRedirect(request.getContextPath() + "/logout?badCredentials=true");
                    return;
                }
                if (isUserDisabled) {
                    response.sendRedirect(request.getContextPath() + "/logout?userIsDisabled=true");
                    return;
                }
            }
        }

        filterChain.doFilter(request, response);
    }

    private enum UserLoginType {
        USERDETAILS("UserDetails"),
        OAUTH2USER("OAuth2User"),
        STRINGUSER("StringUser"),
        UNKNOWN("Unknown"),
        SAML2USER("Saml2User");

        private String method;

        UserLoginType(String method) {
            this.method = method;
        }

        @Override
        public String toString() {
            return method;
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String contextPath = request.getContextPath();
        String[] permitAllPatterns = {
            contextPath + "/login",
            contextPath + "/signup",
            contextPath + "/register",
            contextPath + "/error",
            contextPath + "/images/",
            contextPath + "/public/",
            contextPath + "/css/",
            contextPath + "/fonts/",
            contextPath + "/js/",
            contextPath + "/pdfjs/",
            contextPath + "/pdfjs-legacy/",
            contextPath + "/api/v1/info/status",
            contextPath + "/site.webmanifest"
        };

        for (String pattern : permitAllPatterns) {
            if (uri.startsWith(pattern)
                    || uri.endsWith(".svg")
                    || uri.endsWith(".mjs")
                    || uri.endsWith(".png")
                    || uri.endsWith(".ico")) {
                return true;
            }
        }

        return false;
    }
}
