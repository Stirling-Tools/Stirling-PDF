package stirling.software.proprietary.security.controller.api;

import java.util.HashMap;
import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.bind.annotation.*;

import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.api.user.UsernameAndPass;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.util.CookieUtils;

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
            @RequestBody UsernameAndPass request,
            HttpServletRequest httpRequest,
            HttpServletResponse response) {
        try {
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

            Map<String, Object> claims = new HashMap<>();
            claims.put("authType", AuthenticationType.WEB.toString());
            claims.put("role", user.getRolesAsString());

            String token = jwtService.generateToken(user.getUsername(), claims);

            // Set JWT in HttpOnly cookie
            boolean secure = applicationProperties.getSecurity().getJwt().isSecure();
            response.addHeader(
                    HttpHeaders.SET_COOKIE,
                    CookieUtils.createAccessTokenCookie(token, secure).toString());

            // Record successful login
            loginAttemptService.loginSucceeded(username);
            log.info("Login successful for user: {} from IP: {}", username, ip);

            // Check if request is from Tauri native app
            // Tauri clients need token in response body since they can't use HttpOnly cookies
            String userAgent = httpRequest.getHeader(HttpHeaders.USER_AGENT);
            boolean isTauriClient = userAgent != null && userAgent.toLowerCase().contains("tauri");

            if (isTauriClient) {
                // For Tauri clients, include token in response body
                log.debug("Detected Tauri client, including token in response body");
                Map<String, Object> responseBody = new HashMap<>();
                responseBody.put("user", buildUserResponse(user));
                responseBody.put("token", token);
                return ResponseEntity.ok(responseBody);
            }

            // Return user info only (token is in cookie for web clients)
            return ResponseEntity.ok(Map.of("user", buildUserResponse(user)));

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
                    || auth.getPrincipal().equals("anonymousUser")) {
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

            // Clear JWT cookie
            response.addHeader(
                    HttpHeaders.SET_COOKIE,
                    CookieUtils.createExpiredCookie(CookieUtils.JWT_COOKIE_NAME).toString());

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

            jwtService.validateToken(token);
            String username = jwtService.extractUsername(token);

            UserDetails userDetails = userDetailsService.loadUserByUsername(username);
            User user = (User) userDetails;

            Map<String, Object> claims = new HashMap<>();
            claims.put("authType", user.getAuthenticationType());
            claims.put("role", user.getRolesAsString());

            String newToken = jwtService.generateToken(username, claims);

            // Set new JWT in HttpOnly cookie
            boolean secure = applicationProperties.getSecurity().getJwt().isSecure();
            response.addHeader(
                    HttpHeaders.SET_COOKIE,
                    CookieUtils.createAccessTokenCookie(newToken, secure).toString());

            log.debug("Token refreshed for user: {}", username);

            return ResponseEntity.ok(Map.of("message", "Token refreshed successfully"));

        } catch (Exception e) {
            log.error("Token refresh error", e);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Token refresh failed"));
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

        // Add metadata for OAuth compatibility
        Map<String, Object> appMetadata = new HashMap<>();
        appMetadata.put("provider", user.getAuthenticationType()); // Default to email provider
        userMap.put("app_metadata", appMetadata);

        return userMap;
    }
}
