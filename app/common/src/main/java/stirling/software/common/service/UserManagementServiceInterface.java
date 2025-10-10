package stirling.software.common.service;

import java.util.List;
import java.util.Map;

/**
 * Interface for user management service with 5-user limit enforcement.
 * This interface is exposed to OSS modules while implementation remains in proprietary module.
 */
public interface UserManagementServiceInterface {

    /**
     * Create a new user account.
     *
     * @param request The user creation request
     * @return The created user DTO
     * @throws UserLimitExceededException if user limit is reached
     * @throws IllegalArgumentException if validation fails
     */
    UserDto createUser(CreateUserRequest request) throws UserLimitExceededException, IllegalArgumentException;

    /**
     * Update an existing user.
     *
     * @param userId The user ID
     * @param request The update request
     * @return The updated user DTO
     * @throws IllegalArgumentException if validation fails
     */
    UserDto updateUser(Long userId, UpdateUserRequest request) throws IllegalArgumentException;

    /**
     * Delete a user account.
     *
     * @param userId The user ID to delete
     * @throws IllegalArgumentException if user cannot be deleted
     */
    void deleteUser(Long userId) throws IllegalArgumentException;

    /**
     * Enable or disable a user account.
     *
     * @param userId The user ID
     * @param enabled True to enable, false to disable
     */
    void setUserEnabled(Long userId, boolean enabled);

    /**
     * List all users in the system.
     *
     * @return List of user DTOs
     */
    List<UserDto> listUsers();

    /**
     * Get a specific user by ID.
     *
     * @param userId The user ID
     * @return The user DTO or null if not found
     */
    UserDto getUser(Long userId);

    /**
     * Get a specific user by username.
     *
     * @param username The username
     * @return The user DTO or null if not found
     */
    UserDto getUserByUsername(String username);

    /**
     * Check if a new user can be created (enforces 5-user limit).
     *
     * @return true if a new user can be created
     */
    boolean canCreateUser();

    /**
     * Get the current user count (excluding internal users).
     *
     * @return The number of active users
     */
    int getUserCount();

    /**
     * Get the maximum allowed users based on license.
     *
     * @return The maximum user limit (5 for free tier)
     */
    int getMaxUserLimit();

    /**
     * Reset a user's password (admin action).
     *
     * @param userId The user ID
     * @param newPassword The new password
     * @throws IllegalArgumentException if validation fails
     */
    void resetUserPassword(Long userId, String newPassword) throws IllegalArgumentException;

    /**
     * Force a user to change password on next login.
     *
     * @param userId The user ID
     */
    void forcePasswordChange(Long userId);

    /**
     * DTO for user information.
     */
    class UserDto {
        private Long id;
        private String username;
        private String email;
        private String role;
        private boolean enabled;
        private boolean firstLogin;
        private String createdAt;
        private String lastLoginAt;
        private String authenticationType;

        // Getters and setters
        public Long getId() { return id; }
        public void setId(Long id) { this.id = id; }

        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }

        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }

        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }

        public boolean isFirstLogin() { return firstLogin; }
        public void setFirstLogin(boolean firstLogin) { this.firstLogin = firstLogin; }

        public String getCreatedAt() { return createdAt; }
        public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

        public String getLastLoginAt() { return lastLoginAt; }
        public void setLastLoginAt(String lastLoginAt) { this.lastLoginAt = lastLoginAt; }

        public String getAuthenticationType() { return authenticationType; }
        public void setAuthenticationType(String authenticationType) { this.authenticationType = authenticationType; }
    }

    /**
     * Request for creating a new user.
     */
    class CreateUserRequest {
        private String username;
        private String password;
        private String email;
        private String role;
        private boolean enabled = true;

        // Getters and setters
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }

        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }

        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }

        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
    }

    /**
     * Request for updating a user.
     */
    class UpdateUserRequest {
        private String email;
        private String role;
        private Boolean enabled;
        private Map<String, String> settings;

        // Getters and setters
        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }

        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }

        public Boolean getEnabled() { return enabled; }
        public void setEnabled(Boolean enabled) { this.enabled = enabled; }

        public Map<String, String> getSettings() { return settings; }
        public void setSettings(Map<String, String> settings) { this.settings = settings; }
    }

    /**
     * Exception thrown when user limit is exceeded.
     */
    class UserLimitExceededException extends Exception {
        public UserLimitExceededException(String message) {
            super(message);
        }
    }
}