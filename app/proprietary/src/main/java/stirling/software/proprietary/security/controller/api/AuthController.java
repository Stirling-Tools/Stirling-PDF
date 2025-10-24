package stirling.software.proprietary.security.controller.api;

import java.util.HashMap;
import java.util.Map;

import jakarta.servlet.http.Cookie;
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

import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.api.user.UsernameAndPass;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.RefreshTokenService;
import stirling.software.proprietary.security.service.UserService;

/** REST API Controller for authentication operations. */
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Authentication", description = "Endpoints for user authentication and registration")
public class AuthController {

    private final UserService userService;
    private final JwtServiceInterface jwtService;
    private final RefreshTokenService refreshTokenService;
    private final CustomUserDetailsService userDetailsService;

    /**
     * Login endpoint - replaces Supabase signInWithPassword
     *
     * @param request Login credentials (email/username and password)
     * @param servletRequest HTTP request for extracting IP and user agent
     * @param response HTTP response to set JWT cookie
     * @return User and session information
     */
    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/login")
    public ResponseEntity<?> login(
            @RequestBody UsernameAndPass request,
            HttpServletRequest servletRequest,
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

            log.debug("Login attempt for user: {}", request.getUsername());

            UserDetails userDetails =
                    userDetailsService.loadUserByUsername(request.getUsername().trim());
            User user = (User) userDetails;

            if (!userService.isPasswordCorrect(user, request.getPassword())) {
                log.warn("Invalid password for user: {}", request.getUsername());
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "Invalid credentials"));
            }

            if (!user.isEnabled()) {
                log.warn("Disabled user attempted login: {}", request.getUsername());
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "User account is disabled"));
            }

            Map<String, Object> claims = new HashMap<>();
            claims.put("authType", AuthenticationType.WEB.toString());
            claims.put("role", user.getRolesAsString());

            String token = jwtService.generateToken(user.getUsername(), claims);

            // Generate refresh token for token rotation
            String refreshToken =
                    refreshTokenService.generateRefreshToken(user.getId(), servletRequest);

            // Set JWT as HttpOnly cookie for security
            setJwtCookie(response, token);

            // Set refresh token as HttpOnly cookie
            setRefreshTokenCookie(response, refreshToken);

            log.info("Login successful for user: {}", request.getUsername());

            return ResponseEntity.ok(
                    Map.of(
                            "user", buildUserResponse(user),
                            "session", Map.of("access_token", token, "expires_in", 3600)));

        } catch (UsernameNotFoundException e) {
            log.warn("User not found: {}", request.getUsername());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid username or password"));
        } catch (AuthenticationException e) {
            log.error("Authentication failed for user: {}", request.getUsername(), e);
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
     * Logout endpoint - revokes all refresh tokens and clears cookies
     *
     * @param response HTTP response to clear cookies
     * @return Success message
     */
    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletResponse response) {
        try {
            // Get current user from security context
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

            if (authentication != null && authentication.getPrincipal() instanceof User user) {
                // Revoke all refresh tokens for this user
                int revokedCount = refreshTokenService.revokeAllTokensForUser(user.getId());
                log.info(
                        "Revoked {} refresh token(s) for user: {}",
                        revokedCount,
                        user.getUsername());
            }

            // Clear cookies
            clearAuthCookies(response);

            // Clear security context
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
     * Refresh token endpoint - validates refresh token and issues new access token.
     * Implements token rotation for security: revokes old refresh token and issues new one
     *
     * @param request HTTP request
     * @param response HTTP response
     * @return the refreshed token
     */
    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(HttpServletRequest request, HttpServletResponse response) {
        try {
            // Extract refresh token from cookie
            String refreshToken = extractRefreshTokenFromCookie(request);

            if (refreshToken == null || refreshToken.isEmpty()) {
                log.debug("Token refresh failed: no refresh token in cookie");
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "No refresh token found"));
            }

            var refreshTokenOpt = refreshTokenService.validateRefreshToken(refreshToken);

            if (refreshTokenOpt.isEmpty()) {
                log.debug("Token refresh failed: invalid or expired refresh token");
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "Invalid or expired refresh token"));
            }

            var refreshTokenEntity = refreshTokenOpt.get();
            Long userId = refreshTokenEntity.getUserId();

            User user = userService.findById(userId).orElse(null);

            if (user == null) {
                log.warn("Token refresh failed: user not found for ID: {}", userId);
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "User not found"));
            }

            if (!user.isEnabled()) {
                log.warn("Token refresh failed: user disabled: {}", user.getUsername());
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "User account is disabled"));
            }

            // Generate new access token
            Map<String, Object> claims = new HashMap<>();
            claims.put("authType", user.getAuthenticationType());
            claims.put("role", user.getRolesAsString());

            String newAccessToken = jwtService.generateToken(user.getUsername(), claims);

            // Rotate refresh token for security (revoke old, issue new)
            String newRefreshToken =
                    refreshTokenService.rotateRefreshToken(refreshToken, userId, request);

            // Set new cookies
            setJwtCookie(response, newAccessToken);
            setRefreshTokenCookie(response, newRefreshToken);

            log.info("Token refreshed successfully for user: {}", user.getUsername());

            return ResponseEntity.ok(Map.of("access_token", newAccessToken, "expires_in", 3600));

        } catch (Exception e) {
            log.error("Token refresh error", e);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Token refresh failed"));
        }
    }

    /**
     * Extracts refresh token from HTTP cookie
     *
     * @param request HTTP request
     * @return Refresh token or null if not found
     */
    private String extractRefreshTokenFromCookie(HttpServletRequest request) {
        if (request.getCookies() == null) {
            return null;
        }

        for (Cookie cookie : request.getCookies()) {
            if ("stirling_refresh_token".equals(cookie.getName())) {
                return cookie.getValue();
            }
        }

        return null;
    }

    /**
     * Sets JWT as an HttpOnly cookie for security Prevents XSS attacks by making token inaccessible
     * to JavaScript
     *
     * @param response HTTP response to set cookie
     * @param jwt JWT token to store
     */
    private void setJwtCookie(HttpServletResponse response, String jwt) {
        jwtService.setJwtCookie(response, jwt, "");
    }

    /**
     * Sets refresh token as an HttpOnly cookie for security
     *
     * @param response HTTP response to set cookie
     * @param refreshToken Refresh token to store
     */
    private void setRefreshTokenCookie(HttpServletResponse response, String refreshToken) {
        jwtService.setRefreshTokenCookie(response, refreshToken, "", 7 * 24 * 3600);
    }

    /**
     * Clears authentication cookies (used on logout)
     *
     * @param response HTTP response
     */
    private void clearAuthCookies(HttpServletResponse response) {
        jwtService.removeJwtCookie(response, "");
        jwtService.removeRefreshTokenCookie(response, "");
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

    /**
     * Get security configuration (including secureCookie flag)
     *
     * @return Security configuration
     */
    @GetMapping("/config")
    public ResponseEntity<Map<String, Object>> getAuthConfig() {
        Map<String, Object> config = new HashMap<>();
        config.put("secureCookie", jwtService.isSecureCookie());
        config.put("jwtEnabled", jwtService.isJwtEnabled());

        log.debug("Auth config requested: secureCookie={}", jwtService.isSecureCookie());
        return ResponseEntity.ok(config);
    }

    // ===========================
    // Request/Response DTOs
    // ===========================

    /** Login request DTO */
    public record LoginRequest(String email, String password) {}
}
