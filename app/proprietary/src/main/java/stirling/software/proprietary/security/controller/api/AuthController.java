package stirling.software.proprietary.security.controller.api;

import java.util.HashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.UserApi;
import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.UserService;

/**
 * REST API Controller for authentication operations. Replaces Supabase authentication with Spring
 * Security + JWT.
 *
 * <p>This controller provides endpoints matching the Supabase API surface to enable seamless
 * frontend integration.
 */
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Slf4j
@UserApi
public class AuthController {

    private final UserService userService;
    private final JwtServiceInterface jwtService;
    private final CustomUserDetailsService userDetailsService;

    /**
     * Login endpoint - replaces Supabase signInWithPassword
     *
     * @param request Login credentials (email/username and password)
     * @param response HTTP response to set JWT cookie
     * @return User and session information
     */
    @PostMapping("/login")
    public ResponseEntity<?> login(
            @RequestBody LoginRequest request, HttpServletResponse response) {
        try {
            log.debug("Login attempt for user: {}", request.email());

            // Load user
            UserDetails userDetails = userDetailsService.loadUserByUsername(request.email());
            User user = (User) userDetails;

            // Validate password
            if (!userService.isPasswordCorrect(user, request.password())) {
                log.warn("Invalid password for user: {}", request.email());
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "Invalid credentials"));
            }

            // Check if user is enabled
            if (!user.isEnabled()) {
                log.warn("Disabled user attempted login: {}", request.email());
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "User account is disabled"));
            }

            // Generate JWT with claims
            Map<String, Object> claims = new HashMap<>();
            claims.put("authType", AuthenticationType.WEB.toString());
            claims.put("role", user.getRolesAsString());

            String token = jwtService.generateToken(user.getUsername(), claims);

            // Set JWT cookie (HttpOnly for security)
            jwtService.addToken(response, token);

            log.info("Login successful for user: {}", request.email());

            // Return user info (matches Supabase response structure)
            return ResponseEntity.ok(
                    Map.of(
                            "user", buildUserResponse(user),
                            "session", Map.of("access_token", token, "expires_in", 3600)));

        } catch (AuthenticationException e) {
            log.error("Authentication failed for user: {}", request.email(), e);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid credentials"));
        } catch (Exception e) {
            log.error("Login error for user: {}", request.email(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Internal server error"));
        }
    }

    /**
     * Registration endpoint - replaces Supabase signUp
     *
     * @param request Registration details (email, password, name)
     * @return User information or error
     */
    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody RegisterRequest request) {
        try {
            log.debug("Registration attempt for user: {}", request.email());

            // Check if username exists
            if (userService.usernameExistsIgnoreCase(request.email())) {
                log.warn("Registration failed: username already exists: {}", request.email());
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "User already exists"));
            }

            // Validate username format
            if (!userService.isUsernameValid(request.email())) {
                log.warn("Registration failed: invalid username format: {}", request.email());
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Invalid username format"));
            }

            // Validate password
            if (request.password() == null || request.password().length() < 6) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Password must be at least 6 characters"));
            }

            // Create user (using default team and USER role)
            User user =
                    userService.saveUser(
                            request.email(),
                            request.password(),
                            (Long) null, // team (use default)
                            Role.USER.getRoleId(),
                            false // first login not required
                            );

            log.info("User registered successfully: {}", request.email());

            // Return user info (Note: No session, user must login)
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(
                            Map.of(
                                    "user",
                                    buildUserResponse(user),
                                    "message",
                                    "Account created successfully. Please log in."));

        } catch (IllegalArgumentException e) {
            log.error("Registration validation error: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Registration error for user: {}", request.email(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Registration failed: " + e.getMessage()));
        }
    }

    /**
     * Get current user - replaces Supabase getSession
     *
     * @return Current authenticated user information
     */
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
     * Logout endpoint - replaces Supabase signOut
     *
     * @param response HTTP response to clear JWT cookie
     * @return Success message
     */
    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletResponse response) {
        try {
            // Clear JWT cookie
            jwtService.clearToken(response);

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
     * Refresh token - replaces Supabase refreshSession
     *
     * @param request HTTP request containing current JWT cookie
     * @param response HTTP response to set new JWT cookie
     * @return New token information
     */
    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(HttpServletRequest request, HttpServletResponse response) {
        try {
            String token = jwtService.extractToken(request);

            if (token == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "No token found"));
            }

            // Validate and extract username
            jwtService.validateToken(token);
            String username = jwtService.extractUsername(token);

            // Generate new token
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);
            User user = (User) userDetails;

            Map<String, Object> claims = new HashMap<>();
            claims.put("authType", AuthenticationType.WEB.toString());
            claims.put("role", user.getRolesAsString());

            String newToken = jwtService.generateToken(username, claims);
            jwtService.addToken(response, newToken);

            log.debug("Token refreshed for user: {}", username);

            return ResponseEntity.ok(Map.of("access_token", newToken, "expires_in", 3600));

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
        appMetadata.put("provider", "email"); // Default to email provider
        userMap.put("app_metadata", appMetadata);

        return userMap;
    }

    // ===========================
    // Request/Response DTOs
    // ===========================

    /** Login request DTO */
    public record LoginRequest(String email, String password) {}

    /** Registration request DTO */
    public record RegisterRequest(String email, String password, String name) {}
}
