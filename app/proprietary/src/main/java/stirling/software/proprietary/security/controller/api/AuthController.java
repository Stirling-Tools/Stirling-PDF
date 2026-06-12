package stirling.software.proprietary.security.controller.api;

import java.util.HashMap;
import java.util.Map;

import io.quarkus.security.identity.SecurityIdentity;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.vertx.core.http.HttpServerRequest;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.constants.JwtConstants;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.security.AuthenticationException;
import stirling.software.common.security.UsernameNotFoundException;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.api.user.MfaCodeRequest;
import stirling.software.proprietary.security.model.api.user.UsernameAndPassMfa;
import stirling.software.proprietary.security.model.exception.AuthenticationFailureException;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.MfaService;
import stirling.software.proprietary.security.service.RefreshRateLimitService;
import stirling.software.proprietary.security.service.TotpService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.util.DesktopClientUtils;
import stirling.software.proprietary.service.AiUserDataService;

/** REST API Controller for authentication operations. */
@ApplicationScoped
@Path("/api/v1/auth")
@Slf4j
@Tag(name = "Authentication", description = "Endpoints for user authentication and registration")
public class AuthController {

    @Inject UserService userService;
    @Inject JwtServiceInterface jwtService;
    @Inject CustomUserDetailsService userDetailsService;
    @Inject LoginAttemptService loginAttemptService;
    @Inject MfaService mfaService;
    @Inject TotpService totpService;
    @Inject RefreshRateLimitService refreshRateLimitService;
    @Inject ApplicationProperties.Security securityProperties;
    @Inject ApplicationProperties applicationProperties;
    @Inject AiUserDataService aiUserDataService;

    @Inject SecurityIdentity securityIdentity;

    /**
     * Login endpoint - replaces Supabase signInWithPassword
     *
     * @param request Login credentials (email/username and password)
     * @param response HTTP response to set JWT cookie
     * @return User and session information
     */
    // TODO: Migration required - Spring @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')") was a
    // negated SpEL authority check with no direct JAX-RS @RolesAllowed equivalent. Enforce the
    // "not a demo user" rule via a SecurityIdentity check in-method, a SecurityIdentityAugmentor,
    // or a quarkus.http.auth.* policy.
    @POST
    @Path("/login")
    @Audited(type = AuditEventType.USER_LOGIN, level = AuditLevel.BASIC)
    public Response login(
            UsernameAndPassMfa request,
            @Context HttpServerRequest httpRequest,
            @Context HttpHeaders httpHeaders) {
        try {
            // Check if username/password authentication is allowed
            if (!securityProperties.isUserPass()) {
                log.warn(
                        "Username/password login attempted but not allowed by current login method configuration");
                return Response.status(Response.Status.FORBIDDEN)
                        .entity(
                                Map.of(
                                        "error",
                                        "Username/password authentication is not enabled. Please use the configured authentication method."))
                        .build();
            }

            // Validate input parameters
            if (request.getUsername() == null || request.getUsername().trim().isEmpty()) {
                log.warn("Login attempt with null or empty username");
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Username is required"))
                        .build();
            }

            if (request.getPassword() == null || request.getPassword().isEmpty()) {
                log.warn(
                        "Login attempt with null or empty password for user: {}",
                        request.getUsername());
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Password is required"))
                        .build();
            }

            String username = request.getUsername().trim();
            String ip =
                    httpRequest.remoteAddress() != null ? httpRequest.remoteAddress().host() : null;

            // Check if account is blocked due to too many failed attempts
            if (loginAttemptService.isBlocked(username)) {
                log.warn("Blocked account login attempt for user: {} from IP: {}", username, ip);
                return Response.status(Response.Status.UNAUTHORIZED)
                        .entity(
                                Map.of(
                                        "error",
                                        "Account is locked due to too many failed attempts"))
                        .build();
            }

            log.debug("Login attempt for user: {} from IP: {}", username, ip);

            User user = userDetailsService.loadUserByUsername(username);

            if (!userService.isPasswordCorrect(user, request.getPassword())) {
                log.warn("Invalid password for user: {} from IP: {}", username, ip);
                loginAttemptService.loginFailed(username);
                return Response.status(Response.Status.UNAUTHORIZED)
                        .entity(Map.of("error", "Invalid username or password"))
                        .build();
            }

            if (!user.isEnabled()) {
                log.warn("Disabled user attempted login: {} from IP: {}", username, ip);
                return Response.status(Response.Status.UNAUTHORIZED)
                        .entity(Map.of("error", "User account is disabled"))
                        .build();
            }

            if (mfaService.isMfaEnabled(user)) {
                String code = request.getMfaCode();
                if (code == null || code.isBlank()) {
                    log.warn(
                            "MFA required but no code provided for user: {} from IP: {}",
                            username,
                            ip);
                    // loginAttemptService.loginFailed(username);
                    return Response.status(Response.Status.UNAUTHORIZED)
                            .entity(
                                    Map.of(
                                            "error", "mfa_required",
                                            "message", "Two-factor code required"))
                            .build();
                }
                String secret = mfaService.getSecret(user);
                if (secret == null || secret.isBlank()) {
                    log.error("MFA enabled but no secret stored for user: {}", username);
                    return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                            .entity(Map.of("error", "MFA configuration error"))
                            .build();
                }
                Long timeStep = totpService.getValidTimeStep(secret, code);
                if (timeStep == null) {
                    log.warn("Invalid MFA code for user: {} from IP: {}", username, ip);
                    loginAttemptService.loginFailed(username);
                    return Response.status(Response.Status.UNAUTHORIZED)
                            .entity(
                                    Map.of(
                                            "error", "invalid_mfa_code",
                                            "message", "Invalid two-factor code"))
                            .build();
                }
                if (!mfaService.markTotpStepUsed(user, timeStep)) {
                    log.warn("Replay MFA code detected for user: {} from IP: {}", username, ip);
                    loginAttemptService.loginFailed(username);
                    return Response.status(Response.Status.UNAUTHORIZED)
                            .entity(
                                    Map.of(
                                            "error", "invalid_mfa_code",
                                            "message", "Invalid two-factor code"))
                            .build();
                }
            }

            Map<String, Object> claims = new HashMap<>();
            claims.put("authType", AuthenticationType.WEB.toString());
            claims.put("role", user.getRolesAsString());

            // Detect desktop client and issue longer-lived tokens for better UX
            // Desktop apps run on personal devices with OS-level encryption (secure storage)
            boolean isDesktopClient =
                    DesktopClientUtils.isDesktopClientByUserAgent(
                            httpHeaders.getHeaderString("User-Agent"));
            String token;
            int keyRetentionDays = securityProperties.getJwt().getKeyRetentionDays();
            if (isDesktopClient) {
                // Desktop: Use configured desktop token expiry (default 30 days)
                int desktopExpiryMinutes =
                        DesktopClientUtils.getDesktopTokenExpiryMinutes(applicationProperties);
                token = jwtService.generateToken(user.getUsername(), claims, desktopExpiryMinutes);
                log.info(
                        "Issued DESKTOP token for user '{}': expiry={}min ({}d), keyRetention={}d",
                        username,
                        desktopExpiryMinutes,
                        desktopExpiryMinutes / 1440,
                        keyRetentionDays);
            } else {
                // Web: Use configured web expiry (default 24 hours)
                token = jwtService.generateToken(user.getUsername(), claims);
                int webExpiryMinutes =
                        DesktopClientUtils.getWebTokenExpiryMinutes(applicationProperties);
                log.info(
                        "Issued WEB token for user '{}': expiry={}min ({}d), keyRetention={}d",
                        username,
                        webExpiryMinutes,
                        webExpiryMinutes / 1440,
                        keyRetentionDays);
            }

            // Record successful login
            loginAttemptService.loginSucceeded(username);
            log.info(
                    "Login successful for user: {} from IP: {} (desktop: {})",
                    username,
                    ip,
                    isDesktopClient);

            return Response.ok(
                            Map.of(
                                    "user", buildUserResponse(user),
                                    "session",
                                            Map.of(
                                                    "access_token",
                                                    token,
                                                    "expires_in",
                                                    getTokenExpirySeconds(isDesktopClient))))
                    .build();

        } catch (UsernameNotFoundException e) {
            String username = request.getUsername();
            log.warn("User not found: {}", username);
            loginAttemptService.loginFailed(username);
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", "Invalid username or password"))
                    .build();
        } catch (AuthenticationException e) {
            String username = request.getUsername();
            log.error("Authentication failed for user: {}", username, e);
            loginAttemptService.loginFailed(username);
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", "Invalid credentials"))
                    .build();
        } catch (Exception e) {
            log.error("Login error for user: {}", request.getUsername(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Internal server error"))
                    .build();
        }
    }

    /**
     * Get current user
     *
     * @return Current authenticated user information
     */
    // TODO: Migration required - Spring @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')") negated
    // authority check has no direct @RolesAllowed equivalent; enforce via SecurityIdentity/policy.
    @GET
    @Path("/me")
    public Response getCurrentUser() {
        try {
            // TODO: Migration required - was
            // SecurityContextHolder.getContext().getAuthentication().
            // Quarkus SecurityIdentity has no Spring UserDetails principal; loading the full User
            // here requires a SecurityIdentityAugmentor that attaches the User (or re-loading via
            // userDetailsService by name). Until then we re-load the user from the identity name.
            if (securityIdentity == null
                    || securityIdentity.isAnonymous()
                    || securityIdentity.getPrincipal() == null) {
                return Response.status(Response.Status.UNAUTHORIZED)
                        .entity(Map.of("error", "Not authenticated"))
                        .build();
            }

            String username = securityIdentity.getPrincipal().getName();
            User user = userDetailsService.loadUserByUsername(username);

            return Response.ok(Map.of("user", buildUserResponse(user))).build();

        } catch (Exception e) {
            log.error("Get current user error", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Internal server error"))
                    .build();
        }
    }

    /**
     * Logout endpoint
     *
     * @param response HTTP response
     * @return Success message
     */
    // TODO: Migration required - Spring @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')") negated
    // authority check has no direct @RolesAllowed equivalent; enforce via SecurityIdentity/policy.
    @POST
    @Path("/logout")
    public Response logout(@Context HttpHeaders httpHeaders) {
        try {
            // RESTEasy Reactive: the servlet HttpServletRequest is not active on the request
            // thread,
            // so extract the bearer token from the Authorization header and resolve the username
            // via
            // the String-based JWT API instead of
            // jwtService.extractUsernameFromRequestAllowExpired.
            String token = extractBearerToken(httpHeaders);
            String username =
                    (token != null && !token.isBlank())
                            ? jwtService.extractUsernameAllowExpired(token)
                            : null;
            // TODO: Migration required - SecurityContextHolder.clearContext() has no Quarkus
            // equivalent; SecurityIdentity is request-scoped and not cleared imperatively. Cookie/
            // token invalidation is handled by the JWT cookie being dropped by the client/filter.
            aiUserDataService.purgeUserDocuments(username);

            log.debug("User logged out successfully (username={})", username);

            return Response.ok(Map.of("message", "Logged out successfully")).build();

        } catch (Exception e) {
            log.error("Logout error", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Internal server error"))
                    .build();
        }
    }

    /**
     * Refresh token
     *
     * @param request HTTP request containing current JWT cookie
     * @param response HTTP response to set new JWT cookie
     * @return New token information
     */
    // TODO: Migration required - Spring @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')") negated
    // authority check has no direct @RolesAllowed equivalent; enforce via SecurityIdentity/policy.
    @POST
    @Path("/refresh")
    public Response refresh(@Context HttpHeaders httpHeaders) {
        try {
            // RESTEasy Reactive: extract the bearer token from the Authorization header rather than
            // calling jwtService.extractToken(HttpServletRequest), which is not active on the
            // reactive request thread.
            String token = extractBearerToken(httpHeaders);

            if (token == null) {
                return Response.status(Response.Status.UNAUTHORIZED)
                        .entity(Map.of("error", "No token found"))
                        .build();
            }

            // Generate token hash for rate limiting (avoid storing actual tokens)
            String tokenHash = generateTokenHash(token);

            Map<String, Object> claims = jwtService.extractClaimsAllowExpired(token);
            if (!isRefreshWithinGrace(claims)) {
                log.warn("Token refresh rejected: token expired beyond configured grace window");
                return Response.status(Response.Status.UNAUTHORIZED)
                        .entity(Map.of("error", "Token refresh failed"))
                        .build();
            }

            // Only apply rate limiting if token is actually expired (not for valid tokens)
            // This prevents false-positive 429 errors with multiple tabs, retries, etc.
            long expMillis = extractEpochMillis(claims.get("exp"));
            boolean isExpired = expMillis > 0 && expMillis < System.currentTimeMillis();
            if (isExpired
                    && !refreshRateLimitService.isRefreshAllowed(
                            tokenHash, getRefreshGraceMillis())) {
                log.warn(
                        "Token refresh rejected: rate limit exceeded (max {} attempts allowed)",
                        JwtConstants.MAX_REFRESH_ATTEMPTS_IN_GRACE);
                // HTTP 429 TOO_MANY_REQUESTS is not in JAX-RS Response.Status enum; use numeric
                // code
                return Response.status(429)
                        .entity(
                                Map.of(
                                        "error",
                                        "Too many refresh attempts",
                                        "max_attempts",
                                        JwtConstants.MAX_REFRESH_ATTEMPTS_IN_GRACE))
                        .build();
            }

            Object usernameClaim = claims.get("sub");
            String username = usernameClaim != null ? usernameClaim.toString() : null;
            if (username == null || username.isBlank()) {
                log.warn("Token refresh rejected: missing subject claim");
                return Response.status(Response.Status.UNAUTHORIZED)
                        .entity(Map.of("error", "Token refresh failed"))
                        .build();
            }

            User user = userDetailsService.loadUserByUsername(username);

            Map<String, Object> newClaims = new HashMap<>();
            newClaims.put("authType", user.getAuthenticationType());
            newClaims.put("role", user.getRolesAsString());

            // Detect desktop client and issue longer-lived tokens
            boolean isDesktopClient =
                    DesktopClientUtils.isDesktopClientByUserAgent(
                            httpHeaders.getHeaderString("User-Agent"));
            String newToken;
            if (isDesktopClient) {
                int desktopExpiryMinutes =
                        DesktopClientUtils.getDesktopTokenExpiryMinutes(applicationProperties);
                newToken = jwtService.generateToken(username, newClaims, desktopExpiryMinutes);
                log.info(
                        "Refreshed DESKTOP token for user '{}': expiry={}min ({}d)",
                        username,
                        desktopExpiryMinutes,
                        desktopExpiryMinutes / 1440);
            } else {
                newToken = jwtService.generateToken(username, newClaims);
                int webExpiryMinutes =
                        DesktopClientUtils.getWebTokenExpiryMinutes(applicationProperties);
                log.info(
                        "Refreshed WEB token for user '{}': expiry={}min ({}d)",
                        username,
                        webExpiryMinutes,
                        webExpiryMinutes / 1440);
            }

            // Don't clear rate limit tracking - let it expire naturally after grace period
            // This prevents reusing the same expired token indefinitely

            log.debug("Token refreshed for user: {}", username);

            return Response.ok(
                            Map.of(
                                    "user", buildUserResponse(user),
                                    "session",
                                            Map.of(
                                                    "access_token",
                                                    newToken,
                                                    "expires_in",
                                                    getTokenExpirySeconds(isDesktopClient))))
                    .build();

        } catch (AuthenticationFailureException e) {
            log.warn("Token refresh failed: {}", e.getMessage());
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", "Token refresh failed"))
                    .build();
        } catch (Exception e) {
            log.error("Token refresh error", e);
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", "Token refresh failed"))
                    .build();
        }
    }

    // TODO: Migration required - Spring @PreAuthorize("isAuthenticated() &&
    // !hasAuthority('ROLE_DEMO_USER')") combined an authenticated check with a negated authority.
    // The authenticated portion is enforced below via securityIdentity; the "not demo user"
    // portion needs a SecurityIdentity check/augmentor or quarkus.http.auth.* policy.
    @GET
    @Path("/mfa/setup")
    public Response setupMfa() {
        if (securityIdentity == null || securityIdentity.isAnonymous()) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", "Not authenticated"))
                    .build();
        }

        String username = securityIdentity.getPrincipal().getName();
        User user =
                userService
                        .findByUsernameIgnoreCaseWithSettings(username)
                        .orElseThrow(() -> new UsernameNotFoundException("User not found"));
        Response authTypeResponse = ensureWebAuth(user);
        if (authTypeResponse != null) {
            return authTypeResponse;
        }

        if (mfaService.isMfaEnabled(user)) {
            return Response.status(Response.Status.CONFLICT)
                    .entity(Map.of("error", "MFA already enabled"))
                    .build();
        }

        try {
            String secret = totpService.generateSecret();
            mfaService.setSecret(user, secret);
            String otpAuthUri = totpService.buildOtpAuthUri(username, secret);

            return Response.ok(Map.of("secret", secret, "otpauthUri", otpAuthUri)).build();
        } catch (Exception e) {
            log.error("Failed to setup MFA for user: {}", username, e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to setup MFA"))
                    .build();
        }
    }

    // TODO: Migration required - Spring @PreAuthorize("isAuthenticated() &&
    // !hasAuthority('ROLE_DEMO_USER')") - authenticated check enforced via securityIdentity below;
    // the "not demo user" portion needs a SecurityIdentity check/augmentor or quarkus.http.auth.*.
    @POST
    @Path("/mfa/enable")
    public Response enableMfa(MfaCodeRequest request) {
        if (securityIdentity == null || securityIdentity.isAnonymous()) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", "Not authenticated"))
                    .build();
        }

        String username = securityIdentity.getPrincipal().getName();
        User user =
                userService
                        .findByUsernameIgnoreCaseWithSettings(username)
                        .orElseThrow(() -> new UsernameNotFoundException("User not found"));
        Response authTypeResponse = ensureWebAuth(user);
        if (authTypeResponse != null) {
            return authTypeResponse;
        }

        String secret = mfaService.getSecret(user);
        if (secret == null || secret.isBlank()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "MFA setup required"))
                    .build();
        }

        if (request == null || request.getCode() == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "MFA code is required"))
                    .build();
        }

        Long timeStep = totpService.getValidTimeStep(secret, request.getCode());
        if (timeStep == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", "Invalid two-factor code"))
                    .build();
        }

        try {
            if (!mfaService.isTotpStepUsable(user, timeStep)) {
                return Response.status(Response.Status.UNAUTHORIZED)
                        .entity(Map.of("error", "Invalid two-factor code"))
                        .build();
            }
            mfaService.enableMfa(user);
            mfaService.markTotpStepUsed(user, timeStep);
            mfaService.setMfaRequired(user, false);
            return Response.ok(Map.of("enabled", true)).build();
        } catch (Exception e) {
            log.error("Failed to enable MFA for user: {}", username, e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to enable MFA"))
                    .build();
        }
    }

    // TODO: Migration required - Spring @PreAuthorize("isAuthenticated() &&
    // !hasAuthority('ROLE_DEMO_USER')") - authenticated check enforced via securityIdentity below;
    // the "not demo user" portion needs a SecurityIdentity check/augmentor or quarkus.http.auth.*.
    @POST
    @Path("/mfa/disable")
    public Response disableMfa(MfaCodeRequest request) {
        if (securityIdentity == null || securityIdentity.isAnonymous()) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", "Not authenticated"))
                    .build();
        }

        String username = securityIdentity.getPrincipal().getName();
        User user =
                userService
                        .findByUsernameIgnoreCaseWithSettings(username)
                        .orElseThrow(() -> new UsernameNotFoundException("User not found"));
        Response authTypeResponse = ensureWebAuth(user);
        if (authTypeResponse != null) {
            return authTypeResponse;
        }

        if (!mfaService.isMfaEnabled(user)) {
            return Response.ok(Map.of("enabled", false)).build();
        }

        String secret = mfaService.getSecret(user);
        if (secret == null || secret.isBlank()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "MFA configuration missing"))
                    .build();
        }

        if (request == null || request.getCode() == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "MFA code is required"))
                    .build();
        }

        Long timeStep = totpService.getValidTimeStep(secret, request.getCode());
        if (timeStep == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", "Invalid two-factor code"))
                    .build();
        }

        try {
            if (!mfaService.isTotpStepUsable(user, timeStep)) {
                return Response.status(Response.Status.UNAUTHORIZED)
                        .entity(Map.of("error", "Invalid two-factor code"))
                        .build();
            }
            mfaService.disableMfa(user);
            mfaService.markTotpStepUsed(user, timeStep);
            return Response.ok(Map.of("enabled", false)).build();
        } catch (Exception e) {
            log.error("Failed to disable MFA for user: {}", username, e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to disable MFA"))
                    .build();
        }
    }

    // TODO: Migration required - Spring @PreAuthorize("isAuthenticated() &&
    // !hasAuthority('ROLE_DEMO_USER')") - authenticated check enforced via securityIdentity below;
    // the "not demo user" portion needs a SecurityIdentity check/augmentor or quarkus.http.auth.*.
    @POST
    @Path("/mfa/setup/cancel")
    public Response cancelMfaSetup() {
        if (securityIdentity == null || securityIdentity.isAnonymous()) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", "Not authenticated"))
                    .build();
        }

        String username = securityIdentity.getPrincipal().getName();
        User user =
                userService
                        .findByUsernameIgnoreCaseWithSettings(username)
                        .orElseThrow(() -> new UsernameNotFoundException("User not found"));

        if (mfaService.isMfaEnabled(user)) {
            return Response.status(Response.Status.CONFLICT)
                    .entity(Map.of("error", "MFA already enabled"))
                    .build();
        }

        try {
            mfaService.clearPendingSecret(user);
            return Response.ok(Map.of("cleared", true)).build();
        } catch (Exception e) {
            log.error("Failed to clear MFA setup for user: {}", username, e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to clear MFA setup"))
                    .build();
        }
    }

    /**
     * Admin endpoint to disable MFA for a user
     *
     * @param username Username of the user to disable MFA for
     * @return Response indicating success or failure
     */
    @RolesAllowed("ADMIN")
    @POST
    @Path("/mfa/disable/admin/{username}")
    public Response disableMfaByAdmin(@PathParam("username") String username) {
        try {
            User user =
                    userService
                            .findByUsernameIgnoreCaseWithSettings(username)
                            .orElseThrow(() -> new UsernameNotFoundException("User not found"));

            if (!mfaService.isMfaEnabled(user)) {
                return Response.ok(Map.of("enabled", false)).build();
            }

            mfaService.disableMfa(user);
            return Response.ok(Map.of("enabled", false)).build();
        } catch (UsernameNotFoundException e) {
            log.warn("User not found for MFA disable: {}", username);
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "User not found"))
                    .build();
        } catch (Exception e) {
            log.error("Failed to disable MFA for user: {}", username, e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to disable MFA"))
                    .build();
        }
    }

    /**
     * Helper method to build user response object
     *
     * @param user User entity
     * @return Map containing user information
     */
    private Map<String, Object> buildUserResponse(User user) {
        Map<String, Object> userMap = new HashMap<>();
        userMap.put("id", user.getId());
        userMap.put("email", user.getUsername()); // Use username as email
        userMap.put("username", user.getUsername());
        userMap.put("role", user.getRolesAsString());
        userMap.put("enabled", user.isEnabled());
        userMap.put(
                "authenticationType",
                user.getAuthenticationType()); // Expose authentication type for SSO detection

        // Add metadata for OAuth compatibility
        Map<String, Object> appMetadata = new HashMap<>();
        appMetadata.put("provider", user.getAuthenticationType());
        userMap.put("app_metadata", appMetadata);

        // Add user metadata
        Map<String, Object> userMetadata = new HashMap<>();
        userMetadata.put("firstLogin", user.isFirstLogin());
        userMap.put("user_metadata", userMetadata);

        return userMap;
    }

    private long getTokenExpirySeconds() {
        int configuredMinutes = securityProperties.getJwt().getTokenExpiryMinutes();
        int expiryMinutes =
                configuredMinutes > 0
                        ? configuredMinutes
                        : JwtConstants.DEFAULT_TOKEN_EXPIRY_MINUTES;
        return expiryMinutes * JwtConstants.SECONDS_PER_MINUTE;
    }

    private long getTokenExpirySeconds(boolean isDesktop) {
        if (isDesktop) {
            // Desktop: use configured desktop token expiry
            return DesktopClientUtils.getDesktopTokenExpiryMinutes(applicationProperties)
                    * JwtConstants.SECONDS_PER_MINUTE;
        }
        // Web: use configured web value
        return getTokenExpirySeconds();
    }

    private boolean isRefreshWithinGrace(Map<String, Object> claims) {
        long expMillis = extractEpochMillis(claims.get("exp"));
        if (expMillis <= 0) {
            return false;
        }

        long now = System.currentTimeMillis();
        if (expMillis >= now) {
            return true;
        }

        long expiredForMillis = now - expMillis;
        return expiredForMillis <= getRefreshGraceMillis();
    }

    private long getRefreshGraceMillis() {
        int configuredMinutes = securityProperties.getJwt().getRefreshGraceMinutes();
        int graceMinutes =
                configuredMinutes >= 0
                        ? configuredMinutes
                        : JwtConstants.DEFAULT_REFRESH_GRACE_MINUTES;
        return graceMinutes * JwtConstants.MILLIS_PER_MINUTE;
    }

    private long extractEpochMillis(Object claimValue) {
        if (claimValue == null) {
            return -1L;
        }

        if (claimValue instanceof java.util.Date date) {
            return date.getTime();
        }

        if (claimValue instanceof Number number) {
            long epochSeconds = number.longValue();
            return epochSeconds * 1000L;
        }

        return -1L;
    }

    /**
     * Generate a hash of the token for rate limiting purposes.
     *
     * <p>Uses SHA-256 to avoid storing actual token values in memory.
     *
     * @param token the JWT token
     * @return hex-encoded SHA-256 hash of the token
     */
    private String generateTokenHash(String token) {
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hashBytes =
                    digest.digest(token.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hashBytes) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) {
                    hexString.append('0');
                }
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            // Fallback to hashCode if SHA-256 is not available (should never happen)
            log.warn("SHA-256 not available, using hashCode for token tracking", e);
            return String.valueOf(token.hashCode());
        }
    }

    /**
     * Extract the JWT bearer token from the Authorization header.
     *
     * <p>RESTEasy Reactive helper that mirrors {@code JwtService.extractToken(HttpServletRequest)}
     * but reads from JAX-RS {@link HttpHeaders} so it works on the reactive request thread (the
     * servlet request context is not active there).
     *
     * @param httpHeaders the JAX-RS request headers
     * @return the bearer token, or null if no valid Authorization: Bearer header is present
     */
    private String extractBearerToken(HttpHeaders httpHeaders) {
        String authHeader = httpHeaders.getHeaderString(HttpHeaders.AUTHORIZATION);
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }
        return null;
    }

    private Response ensureWebAuth(User user) {
        if (!AuthenticationType.WEB.name().equalsIgnoreCase(user.getAuthenticationType())) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity(Map.of("error", "MFA settings are only available for web accounts"))
                    .build();
        }
        return null;
    }
}
