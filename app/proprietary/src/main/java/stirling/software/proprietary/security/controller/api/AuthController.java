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
    private final CustomUserDetailsService userDetailsService;

    /**
     * Login endpoint - replaces Supabase signInWithPassword
     *
     * @param request Login credentials (email/username and password)
     * @param response HTTP response to set JWT cookie
     * @return User and session information
     */
    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/login")
    public ResponseEntity<?> login(
            @RequestBody UsernameAndPass request, HttpServletResponse response) {
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

            jwtService.validateToken(token);
            String username = jwtService.extractUsername(token);

            UserDetails userDetails = userDetailsService.loadUserByUsername(username);
            User user = (User) userDetails;

            Map<String, Object> claims = new HashMap<>();
            claims.put("authType", user.getAuthenticationType());
            claims.put("role", user.getRolesAsString());

            String newToken = jwtService.generateToken(username, claims);

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
        appMetadata.put("provider", user.getAuthenticationType()); // Default to email provider
        userMap.put("app_metadata", appMetadata);

        return userMap;
    }

    // ===========================
    // Request/Response DTOs
    // ===========================

    /** Login request DTO */
    public record LoginRequest(String email, String password) {}
}
