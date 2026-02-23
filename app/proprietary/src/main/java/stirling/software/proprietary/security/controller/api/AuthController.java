package stirling.software.proprietary.security.controller.api;

import java.util.HashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.constants.JwtConstants;
import stirling.software.common.model.ApplicationProperties;
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

/** REST API Controller for authentication operations. */
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Authentication", description = "Endpoints for user authentication and registration")
public class AuthController {

    private final UserService userService;
    private final JwtServiceInterface jwtService;
    private final CustomUserDetailsService userDetailsService;
    private final LoginAttemptService loginAttemptService;
    private final MfaService mfaService;
    private final TotpService totpService;
    private final RefreshRateLimitService refreshRateLimitService;
    private final ApplicationProperties.Security securityProperties;
    private final ApplicationProperties applicationProperties;

    /**
     * Login endpoint - replaces Supabase signInWithPassword
     *
     * @param request Login credentials (email/username and password)
     * @param response HTTP response to set JWT cookie
     * @return User and session information
     */
    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/login")
    @Audited(type = AuditEventType.USER_LOGIN, level = AuditLevel.BASIC)
    public ResponseEntity<?> login(
            @RequestBody UsernameAndPassMfa request,
            HttpServletRequest httpRequest,
            HttpServletResponse response) {
        try {
            // Check if username/password authentication is allowed
            if (!securityProperties.isUserPass()) {
                log.warn(
                        "Username/password login attempted but not allowed by current login method configuration");
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(
                                Map.of(
                                        "error",
                                        "Username/password authentication is not enabled. Please use the configured authentication method."));
            }

            // Validate input parameters
            if (request.getUsername() == null || request.getUsername().trim().isEmpty()) {
                log.warn("Login attempt with null or empty username");
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Username is required"));
            }

            if (request.getPassword() == null || request.getPassword().isEmpty()) {
                log.warn(
                        "Login attempt with null or empty password for user: {}",
                        request.getUsername());
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Password is required"));
            }

            String username = request.getUsername().trim();
            String ip = httpRequest.getRemoteAddr();

            // Check if account is blocked due to too many failed attempts
            if (loginAttemptService.isBlocked(username)) {
                log.warn("Blocked account login attempt for user: {} from IP: {}", username, ip);
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "Account is locked due to too many failed attempts"));
            }

            log.debug("Login attempt for user: {} from IP: {}", username, ip);

            UserDetails userDetails = userDetailsService.loadUserByUsername(username);
            User user = (User) userDetails;

            if (!userService.isPasswordCorrect(user, request.getPassword())) {
                log.warn("Invalid password for user: {} from IP: {}", username, ip);
                loginAttemptService.loginFailed(username);
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "Invalid credentials"));
            }

            if (!user.isEnabled()) {
                log.warn("Disabled user attempted login: {} from IP: {}", username, ip);
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "User account is disabled"));
            }

            if (mfaService.isMfaEnabled(user)) {
                String code = request.getMfaCode();
                if (code == null || code.isBlank()) {
                    log.warn(
                            "MFA required but no code provided for user: {} from IP: {}",
                            username,
                            ip);
                    // loginAttemptService.loginFailed(username);
                    return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                            .body(
                                    Map.of(
                                            "error", "mfa_required",
                                            "message", "Two-factor code required"));
                }
                String secret = mfaService.getSecret(user);
                if (secret == null || secret.isBlank()) {
                    log.error("MFA enabled but no secret stored for user: {}", username);
                    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                            .body(Map.of("error", "MFA configuration error"));
                }
                Long timeStep = totpService.getValidTimeStep(secret, code);
                if (timeStep == null) {
                    log.warn("Invalid MFA code for user: {} from IP: {}", username, ip);
                    loginAttemptService.loginFailed(username);
                    return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                            .body(
                                    Map.of(
                                            "error", "invalid_mfa_code",
                                            "message", "Invalid two-factor code"));
                }
                if (!mfaService.markTotpStepUsed(user, timeStep)) {
                    log.warn("Replay MFA code detected for user: {} from IP: {}", username, ip);
                    loginAttemptService.loginFailed(username);
                    return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                            .body(
                                    Map.of(
                                            "error", "invalid_mfa_code",
                                            "message", "Invalid two-factor code"));
                }
            }

            Map<String, Object> claims = new HashMap<>();
            claims.put("authType", AuthenticationType.WEB.toString());
            claims.put("role", user.getRolesAsString());

            // Detect desktop client and issue longer-lived tokens for better UX
            // Desktop apps run on personal devices with OS-level encryption (secure storage)
            boolean isDesktopClient = DesktopClientUtils.isDesktopClient(httpRequest);
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

            return ResponseEntity.ok(
                    Map.of(
                            "user", buildUserResponse(user),
                            "session",
                                    Map.of(
                                            "access_token",
                                            token,
                                            "expires_in",
                                            getTokenExpirySeconds(isDesktopClient))));

        } catch (UsernameNotFoundException e) {
            String username = request.getUsername();
            log.warn("User not found: {}", username);
            loginAttemptService.loginFailed(username);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid username or password"));
        } catch (AuthenticationException e) {
            String username = request.getUsername();
            log.error("Authentication failed for user: {}", username, e);
            loginAttemptService.loginFailed(username);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid credentials"));
        } catch (Exception e) {
            log.error("Login error for user: {}", request.getUsername(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Internal server error"));
        }
    }

    /**
     * Get current user
     *
     * @return Current authenticated user information
     */
    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @GetMapping("/me")
    public ResponseEntity<?> getCurrentUser() {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();

            if (auth == null
                    || !auth.isAuthenticated()
                    || "anonymousUser".equals(auth.getPrincipal())) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "Not authenticated"));
            }

            UserDetails userDetails = (UserDetails) auth.getPrincipal();
            User user = (User) userDetails;

            return ResponseEntity.ok(Map.of("user", buildUserResponse(user)));

        } catch (Exception e) {
            log.error("Get current user error", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Internal server error"));
        }
    }

    /**
     * Logout endpoint
     *
     * @param response HTTP response
     * @return Success message
     */
    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletResponse response) {
        try {
            SecurityContextHolder.clearContext();

            log.debug("User logged out successfully");

            return ResponseEntity.ok(Map.of("message", "Logged out successfully"));

        } catch (Exception e) {
            log.error("Logout error", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Internal server error"));
        }
    }

    /**
     * Refresh token
     *
     * @param request HTTP request containing current JWT cookie
     * @param response HTTP response to set new JWT cookie
     * @return New token information
     */
    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(HttpServletRequest request, HttpServletResponse response) {
        try {
            String token = jwtService.extractToken(request);

            if (token == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "No token found"));
            }

            // Generate token hash for rate limiting (avoid storing actual tokens)
            String tokenHash = generateTokenHash(token);

            Map<String, Object> claims = jwtService.extractClaimsAllowExpired(token);
            if (!isRefreshWithinGrace(claims)) {
                log.warn("Token refresh rejected: token expired beyond configured grace window");
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "Token refresh failed"));
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
                return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                        .body(
                                Map.of(
                                        "error",
                                        "Too many refresh attempts",
                                        "max_attempts",
                                        JwtConstants.MAX_REFRESH_ATTEMPTS_IN_GRACE));
            }

            Object usernameClaim = claims.get("sub");
            String username = usernameClaim != null ? usernameClaim.toString() : null;
            if (username == null || username.isBlank()) {
                log.warn("Token refresh rejected: missing subject claim");
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "Token refresh failed"));
            }

            UserDetails userDetails = userDetailsService.loadUserByUsername(username);
            User user = (User) userDetails;

            Map<String, Object> newClaims = new HashMap<>();
            newClaims.put("authType", user.getAuthenticationType());
            newClaims.put("role", user.getRolesAsString());

            // Detect desktop client and issue longer-lived tokens
            boolean isDesktopClient = DesktopClientUtils.isDesktopClient(request);
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

            return ResponseEntity.ok(
                    Map.of(
                            "user", buildUserResponse(user),
                            "session",
                                    Map.of(
                                            "access_token",
                                            newToken,
                                            "expires_in",
                                            getTokenExpirySeconds(isDesktopClient))));

        } catch (AuthenticationFailureException e) {
            log.warn("Token refresh failed: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Token refresh failed"));
        } catch (Exception e) {
            log.error("Token refresh error", e);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Token refresh failed"));
        }
    }

    @PreAuthorize("isAuthenticated() && !hasAuthority('ROLE_DEMO_USER')")
    @GetMapping("/mfa/setup")
    public ResponseEntity<?> setupMfa(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Not authenticated"));
        }

        String username = authentication.getName();
        User user =
                userService
                        .findByUsernameIgnoreCaseWithSettings(username)
                        .orElseThrow(() -> new UsernameNotFoundException("User not found"));
        ResponseEntity<?> authTypeResponse = ensureWebAuth(user);
        if (authTypeResponse != null) {
            return authTypeResponse;
        }

        if (mfaService.isMfaEnabled(user)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "MFA already enabled"));
        }

        try {
            String secret = totpService.generateSecret();
            mfaService.setSecret(user, secret);
            String otpAuthUri = totpService.buildOtpAuthUri(username, secret);

            return ResponseEntity.ok(Map.of("secret", secret, "otpauthUri", otpAuthUri));
        } catch (Exception e) {
            log.error("Failed to setup MFA for user: {}", username, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to setup MFA"));
        }
    }

    @PreAuthorize("isAuthenticated() && !hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/mfa/enable")
    public ResponseEntity<?> enableMfa(
            @RequestBody MfaCodeRequest request, Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Not authenticated"));
        }

        String username = authentication.getName();
        User user =
                userService
                        .findByUsernameIgnoreCaseWithSettings(username)
                        .orElseThrow(() -> new UsernameNotFoundException("User not found"));
        ResponseEntity<?> authTypeResponse = ensureWebAuth(user);
        if (authTypeResponse != null) {
            return authTypeResponse;
        }

        String secret = mfaService.getSecret(user);
        if (secret == null || secret.isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "MFA setup required"));
        }

        if (request == null || request.getCode() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "MFA code is required"));
        }

        Long timeStep = totpService.getValidTimeStep(secret, request.getCode());
        if (timeStep == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid two-factor code"));
        }

        try {
            if (!mfaService.isTotpStepUsable(user, timeStep)) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "Invalid two-factor code"));
            }
            mfaService.enableMfa(user);
            mfaService.markTotpStepUsed(user, timeStep);
            mfaService.setMfaRequired(user, false);
            return ResponseEntity.ok(Map.of("enabled", true));
        } catch (Exception e) {
            log.error("Failed to enable MFA for user: {}", username, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to enable MFA"));
        }
    }

    @PreAuthorize("isAuthenticated() && !hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/mfa/disable")
    public ResponseEntity<?> disableMfa(
            @RequestBody MfaCodeRequest request, Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Not authenticated"));
        }

        String username = authentication.getName();
        User user =
                userService
                        .findByUsernameIgnoreCaseWithSettings(username)
                        .orElseThrow(() -> new UsernameNotFoundException("User not found"));
        ResponseEntity<?> authTypeResponse = ensureWebAuth(user);
        if (authTypeResponse != null) {
            return authTypeResponse;
        }

        if (!mfaService.isMfaEnabled(user)) {
            return ResponseEntity.ok(Map.of("enabled", false));
        }

        String secret = mfaService.getSecret(user);
        if (secret == null || secret.isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "MFA configuration missing"));
        }

        if (request == null || request.getCode() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "MFA code is required"));
        }

        Long timeStep = totpService.getValidTimeStep(secret, request.getCode());
        if (timeStep == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid two-factor code"));
        }

        try {
            if (!mfaService.isTotpStepUsable(user, timeStep)) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "Invalid two-factor code"));
            }
            mfaService.disableMfa(user);
            mfaService.markTotpStepUsed(user, timeStep);
            return ResponseEntity.ok(Map.of("enabled", false));
        } catch (Exception e) {
            log.error("Failed to disable MFA for user: {}", username, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to disable MFA"));
        }
    }

    @PreAuthorize("isAuthenticated() && !hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/mfa/setup/cancel")
    public ResponseEntity<?> cancelMfaSetup(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Not authenticated"));
        }

        String username = authentication.getName();
        User user =
                userService
                        .findByUsernameIgnoreCaseWithSettings(username)
                        .orElseThrow(() -> new UsernameNotFoundException("User not found"));

        if (mfaService.isMfaEnabled(user)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "MFA already enabled"));
        }

        try {
            mfaService.clearPendingSecret(user);
            return ResponseEntity.ok(Map.of("cleared", true));
        } catch (Exception e) {
            log.error("Failed to clear MFA setup for user: {}", username, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to clear MFA setup"));
        }
    }

    /**
     * Admin endpoint to disable MFA for a user
     *
     * @param username Username of the user to disable MFA for
     * @return Response indicating success or failure
     */
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/mfa/disable/admin/{username}")
    public ResponseEntity<?> disableMfaByAdmin(@PathVariable String username) {
        try {
            User user =
                    userService
                            .findByUsernameIgnoreCaseWithSettings(username)
                            .orElseThrow(() -> new UsernameNotFoundException("User not found"));

            if (!mfaService.isMfaEnabled(user)) {
                return ResponseEntity.ok(Map.of("enabled", false));
            }

            mfaService.disableMfa(user);
            return ResponseEntity.ok(Map.of("enabled", false));
        } catch (UsernameNotFoundException e) {
            log.warn("User not found for MFA disable: {}", username);
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "User not found"));
        } catch (Exception e) {
            log.error("Failed to disable MFA for user: {}", username, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to disable MFA"));
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

    private ResponseEntity<?> ensureWebAuth(User user) {
        if (!AuthenticationType.WEB.name().equalsIgnoreCase(user.getAuthenticationType())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "MFA settings are only available for web accounts"));
        }
        return null;
    }
}
