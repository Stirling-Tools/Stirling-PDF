package stirling.software.proprietary.security.filter;

import static stirling.software.common.util.RequestUriUtils.isPublicAuthEndpoint;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

// TODO: Migration required - the following Spring Security core types are still on the
// collaborator APIs (UserService, SessionPersistentRegistry, ApiKeyAuthenticationToken) which are
// NOT yet migrated to Quarkus. Once those collaborators move to io.quarkus.security.identity
// (SecurityIdentity) + a SecurityIdentityAugmentor, replace SecurityContextHolder/Authentication
// with an injected SecurityIdentity (or @Context jakarta.ws.rs.core.SecurityContext) and drop these
// imports. The principal-type dispatch (UserDetails/OAuth2User/CustomSaml2AuthenticatedPrincipal)
// must then be re-expressed via SecurityIdentity attributes/roles.
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.inject.Named;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.ws.rs.core.Response;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.common.model.ApplicationProperties.Security.SAML2;
import stirling.software.common.util.RequestUriUtils;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;

// TODO: Migration required - @Profile("!saas") had no direct annotation equivalent here. Gate this
// filter's activation on the "saas" build profile (e.g. via @io.quarkus.arc.profile.UnlessBuildProfile
// or a runtime check) and register it through Quarkus (quarkus-undertow @WebFilter or a
// jakarta.ws.rs.container.ContainerRequestFilter @Provider). Registration ordering relative to the
// other security filters (JwtAuthenticationFilter, *RateLimitingFilter) must be preserved.
@Slf4j
@ApplicationScoped
public class UserAuthenticationFilter implements Filter {

    private final ApplicationProperties.Security securityProp;
    private final UserService userService;
    private final SessionPersistentRegistry sessionPersistentRegistry;
    private final boolean loginEnabledValue;

    @Inject
    public UserAuthenticationFilter(
            ApplicationProperties.Security securityProp,
            UserService userService,
            SessionPersistentRegistry sessionPersistentRegistry,
            @Named("loginEnabled") boolean loginEnabledValue) {
        this.securityProp = securityProp;
        this.userService = userService;
        this.sessionPersistentRegistry = sessionPersistentRegistry;
        this.loginEnabledValue = loginEnabledValue;
    }

    @Override
    public void doFilter(
            ServletRequest servletRequest, ServletResponse servletResponse, FilterChain filterChain)
            throws ServletException, IOException {

        HttpServletRequest request = (HttpServletRequest) servletRequest;
        HttpServletResponse response = (HttpServletResponse) servletResponse;

        // Spring's OncePerRequestFilter#shouldNotFilter behavior: skip the filter body for static
        // resources, SPA routes and public API endpoints. TODO: Migration required - ensure the
        // Quarkus filter registration does not run this filter more than once per request (the
        // OncePerRequestFilter guarantee).
        if (shouldNotFilter(request)) {
            filterChain.doFilter(request, response);
            return;
        }

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
                        response.setStatus(Response.Status.UNAUTHORIZED.getStatusCode());
                        response.getWriter().write("Invalid API Key.");
                        return;
                    }
                    authentication =
                            new ApiKeyAuthenticationToken(
                                    user.get(), apiKey, user.get().getAuthorities());
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                } catch (AuthenticationException e) {
                    // If API key authentication fails, deny the request
                    response.setStatus(Response.Status.UNAUTHORIZED.getStatusCode());
                    response.getWriter().write("Invalid API Key.");
                    return;
                }
            }
        }

        // If we still don't have any authentication, check if it's a public endpoint. If not, deny
        // the request
        if (authentication == null || !authentication.isAuthenticated()) {
            String contextPath = request.getContextPath();

            // Allow public auth endpoints to pass through without authentication
            if (isPublicAuthEndpoint(requestURI, contextPath)) {
                filterChain.doFilter(request, response);
                return;
            }

            // For API requests, return 401 with JSON response (no redirects)
            response.setStatus(Response.Status.UNAUTHORIZED.getStatusCode());
            response.setContentType("application/json");
            response.getWriter()
                    .write(
                            """
                            {
                              "error": "Unauthorized",
                              "message": "Authentication required. Please provide valid credentials or X-API-KEY header.",
                              "status": 401
                            }
                            """);
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
                    SecurityContextHolder.clearContext();
                    response.setStatus(Response.Status.FORBIDDEN.getStatusCode());
                    response.setContentType("application/json");
                    response.getWriter()
                            .write(
                                    """
                                    {
                                      "error": "Forbidden",
                                      "message": "User registration is blocked by administrator",
                                      "status": 403
                                    }
                                    """);
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

                // Return 401 if credentials are invalid (no redirects)
                if (!isUserExists && notSsoLogin) {
                    SecurityContextHolder.clearContext();
                    response.setStatus(Response.Status.UNAUTHORIZED.getStatusCode());
                    response.setContentType("application/json");
                    response.getWriter()
                            .write(
                                    """
                                    {
                                      "error": "Unauthorized",
                                      "message": "Invalid credentials",
                                      "status": 401
                                    }
                                    """);
                    return;
                }
                if (isUserDisabled) {
                    SecurityContextHolder.clearContext();
                    response.setStatus(Response.Status.FORBIDDEN.getStatusCode());
                    response.setContentType("application/json");
                    response.getWriter()
                            .write(
                                    """
                                    {
                                      "error": "Forbidden",
                                      "message": "User account is disabled",
                                      "status": 403
                                    }
                                    """);
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

    // Was Spring's OncePerRequestFilter#shouldNotFilter; now called explicitly at the top of
    // doFilter. TODO: Migration required - if registered as a ContainerRequestFilter instead of a
    // servlet Filter, fold this skip logic into the request filter using UriInfo.
    private boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String contextPath = request.getContextPath();

        // Allow unauthenticated access to static resources and SPA routes (GET/HEAD only)
        if ("GET".equalsIgnoreCase(request.getMethod())
                || "HEAD".equalsIgnoreCase(request.getMethod())) {
            if (RequestUriUtils.isStaticResource(contextPath, uri)
                    || RequestUriUtils.isFrontendRoute(contextPath, uri)) {
                return true;
            }
        }

        // For API routes, only skip filter for these public endpoints
        String[] publicApiPatterns = {
            contextPath + "/api/v1/info/status",
            contextPath + "/api/v1/auth/login",
            contextPath + "/api/v1/auth/refresh",
            contextPath + "/api/v1/auth/me",
            contextPath + "/api/v1/invite/validate",
            contextPath + "/api/v1/invite/accept",
            contextPath + "/api/v1/ui-data/footer-info"
        };

        for (String pattern : publicApiPatterns) {
            if (uri.startsWith(pattern)) {
                return true;
            }
        }

        return false;
    }
}
