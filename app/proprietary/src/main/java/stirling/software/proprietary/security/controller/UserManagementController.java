package stirling.software.proprietary.security.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.UserManagementServiceInterface;
import stirling.software.common.service.UserManagementServiceInterface.*;

/**
 * REST controller for user management operations (admin only).
 */
@RestController
@RequestMapping("/api/v1/admin/users")
@Tag(name = "User Management", description = "Admin endpoints for user management")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
@Slf4j
public class UserManagementController {

    private final UserManagementServiceInterface userManagementService;

    /**
     * List all users.
     */
    @GetMapping
    @Operation(summary = "List all users")
    public ResponseEntity<UserListResponse> listUsers() {
        log.info("Listing all users");

        List<UserDto> users = userManagementService.listUsers();
        int currentCount = userManagementService.getUserCount();
        int maxLimit = userManagementService.getMaxUserLimit();

        return ResponseEntity.ok(new UserListResponse(
            users,
            currentCount,
            maxLimit,
            userManagementService.canCreateUser()
        ));
    }

    /**
     * Get a specific user by ID.
     */
    @GetMapping("/{userId}")
    @Operation(summary = "Get user by ID")
    public ResponseEntity<UserDto> getUser(@PathVariable Long userId) {
        log.info("Getting user with ID: {}", userId);

        UserDto user = userManagementService.getUser(userId);
        if (user == null) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(user);
    }

    /**
     * Create a new user.
     */
    @PostMapping
    @Operation(summary = "Create new user")
    public ResponseEntity<?> createUser(@Valid @RequestBody CreateUserRequestDto request) {
        log.info("Creating new user: {}", request.getUsername());

        try {
            // Convert DTO to interface request
            CreateUserRequest createRequest = new CreateUserRequest();
            createRequest.setUsername(request.getUsername());
            createRequest.setPassword(request.getPassword());
            createRequest.setEmail(request.getEmail());
            createRequest.setRole(request.getRole());
            createRequest.setEnabled(request.isEnabled());

            UserDto user = userManagementService.createUser(createRequest);

            log.info("User created successfully: {}", user.getUsername());
            return ResponseEntity.status(HttpStatus.CREATED).body(user);

        } catch (UserLimitExceededException e) {
            log.warn("User creation failed - limit exceeded: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(new ErrorResponse("USER_LIMIT_EXCEEDED", e.getMessage()));

        } catch (IllegalArgumentException e) {
            log.warn("User creation failed - validation error: {}", e.getMessage());
            return ResponseEntity.badRequest()
                .body(new ErrorResponse("VALIDATION_ERROR", e.getMessage()));
        }
    }

    /**
     * Update an existing user.
     */
    @PutMapping("/{userId}")
    @Operation(summary = "Update user")
    public ResponseEntity<?> updateUser(
            @PathVariable Long userId,
            @Valid @RequestBody UpdateUserRequestDto request) {

        log.info("Updating user with ID: {}", userId);

        try {
            // Convert DTO to interface request
            UpdateUserRequest updateRequest = new UpdateUserRequest();
            updateRequest.setEmail(request.getEmail());
            updateRequest.setRole(request.getRole());
            updateRequest.setEnabled(request.getEnabled());
            updateRequest.setSettings(request.getSettings());

            UserDto user = userManagementService.updateUser(userId, updateRequest);

            log.info("User updated successfully: {}", user.getUsername());
            return ResponseEntity.ok(user);

        } catch (IllegalArgumentException e) {
            log.warn("User update failed: {}", e.getMessage());
            return ResponseEntity.badRequest()
                .body(new ErrorResponse("UPDATE_ERROR", e.getMessage()));
        }
    }

    /**
     * Delete a user.
     */
    @DeleteMapping("/{userId}")
    @Operation(summary = "Delete user")
    public ResponseEntity<?> deleteUser(@PathVariable Long userId) {
        log.info("Deleting user with ID: {}", userId);

        try {
            userManagementService.deleteUser(userId);
            log.info("User deleted successfully");
            return ResponseEntity.noContent().build();

        } catch (IllegalArgumentException e) {
            log.warn("User deletion failed: {}", e.getMessage());
            return ResponseEntity.badRequest()
                .body(new ErrorResponse("DELETE_ERROR", e.getMessage()));
        }
    }

    /**
     * Enable or disable a user account.
     */
    @PatchMapping("/{userId}/enabled")
    @Operation(summary = "Enable/disable user account")
    public ResponseEntity<?> setUserEnabled(
            @PathVariable Long userId,
            @Valid @RequestBody EnableUserRequest request) {

        log.info("Setting user {} enabled status to: {}", userId, request.isEnabled());

        try {
            userManagementService.setUserEnabled(userId, request.isEnabled());
            return ResponseEntity.ok(new MessageResponse("User status updated successfully"));

        } catch (IllegalArgumentException e) {
            log.warn("Failed to update user status: {}", e.getMessage());
            return ResponseEntity.badRequest()
                .body(new ErrorResponse("UPDATE_ERROR", e.getMessage()));
        }
    }

    /**
     * Reset a user's password (admin action).
     */
    @PostMapping("/{userId}/reset-password")
    @Operation(summary = "Reset user password")
    public ResponseEntity<?> resetUserPassword(
            @PathVariable Long userId,
            @Valid @RequestBody ResetPasswordRequest request) {

        log.info("Admin resetting password for user ID: {}", userId);

        try {
            userManagementService.resetUserPassword(userId, request.getNewPassword());
            return ResponseEntity.ok(new MessageResponse("Password reset successfully"));

        } catch (IllegalArgumentException e) {
            log.warn("Password reset failed: {}", e.getMessage());
            return ResponseEntity.badRequest()
                .body(new ErrorResponse("RESET_ERROR", e.getMessage()));
        }
    }

    /**
     * Force a user to change password on next login.
     */
    @PostMapping("/{userId}/force-password-change")
    @Operation(summary = "Force user to change password on next login")
    public ResponseEntity<?> forcePasswordChange(@PathVariable Long userId) {
        log.info("Forcing password change for user ID: {}", userId);

        try {
            userManagementService.forcePasswordChange(userId);
            return ResponseEntity.ok(new MessageResponse("User will be required to change password on next login"));

        } catch (IllegalArgumentException e) {
            log.warn("Failed to force password change: {}", e.getMessage());
            return ResponseEntity.badRequest()
                .body(new ErrorResponse("UPDATE_ERROR", e.getMessage()));
        }
    }

    /**
     * Get user count and limits.
     */
    @GetMapping("/stats")
    @Operation(summary = "Get user statistics and limits")
    public ResponseEntity<UserStatsResponse> getUserStats() {
        log.info("Getting user statistics");

        return ResponseEntity.ok(new UserStatsResponse(
            userManagementService.getUserCount(),
            userManagementService.getMaxUserLimit(),
            userManagementService.canCreateUser()
        ));
    }

    // Request/Response DTOs

    @Data
    public static class CreateUserRequestDto {
        @NotBlank(message = "Username is required")
        private String username;

        @NotBlank(message = "Password is required")
        private String password;

        private String email;
        private String role = "USER";
        private boolean enabled = true;
    }

    @Data
    public static class UpdateUserRequestDto {
        private String email;
        private String role;
        private Boolean enabled;
        private java.util.Map<String, String> settings;
    }

    @Data
    public static class EnableUserRequest {
        @NotNull(message = "Enabled status is required")
        private boolean enabled;
    }

    @Data
    public static class ResetPasswordRequest {
        @NotBlank(message = "New password is required")
        private String newPassword;
    }

    @Data
    public static class UserListResponse {
        private final List<UserDto> users;
        private final int currentCount;
        private final int maxLimit;
        private final boolean canCreateMore;
    }

    @Data
    public static class UserStatsResponse {
        private final int currentUsers;
        private final int maxUsers;
        private final boolean canCreateUsers;

        public String getLicenseType() {
            if (maxUsers == -1) {
                return "UNLIMITED";
            } else if (maxUsers == 5) {
                return "FREE";
            } else {
                return "PREMIUM";
            }
        }
    }

    @Data
    public static class MessageResponse {
        private final String message;
    }

    @Data
    public static class ErrorResponse {
        private final String code;
        private final String message;
    }
}