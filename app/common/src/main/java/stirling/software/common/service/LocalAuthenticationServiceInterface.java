package stirling.software.common.service;

import java.util.Map;

/**
 * Interface for local database authentication service.
 * This interface is exposed to OSS modules while implementation remains in proprietary module.
 */
public interface LocalAuthenticationServiceInterface {

    /**
     * Authenticate a user with username and password.
     *
     * @param username The username
     * @param password The plain text password
     * @return AuthenticationResult containing JWT token and user info if successful
     */
    AuthenticationResult authenticate(String username, String password);

    /**
     * Logout a user by invalidating their session.
     *
     * @param token The JWT token to invalidate
     */
    void logout(String token);

    /**
     * Validate a password against the configured password policy.
     *
     * @param password The password to validate
     * @return true if password meets all policy requirements
     */
    boolean validatePassword(String password);

    /**
     * Get validation errors for a password.
     *
     * @param password The password to validate
     * @return Map of validation errors (empty if password is valid)
     */
    Map<String, String> getPasswordValidationErrors(String password);

    /**
     * Initiate a password reset process.
     *
     * @param emailOrUsername The email or username of the account
     * @return true if reset email was sent successfully
     */
    boolean initiatePasswordReset(String emailOrUsername);

    /**
     * Reset password using a reset token.
     *
     * @param token The password reset token
     * @param newPassword The new password
     * @return true if password was reset successfully
     */
    boolean resetPassword(String token, String newPassword);

    /**
     * Change password for an authenticated user.
     *
     * @param username The username
     * @param oldPassword The current password
     * @param newPassword The new password
     * @return true if password was changed successfully
     */
    boolean changePassword(String username, String oldPassword, String newPassword);

    /**
     * Check if a user needs to change their password.
     *
     * @param username The username
     * @return true if password change is required
     */
    boolean isPasswordChangeRequired(String username);

    /**
     * Result of an authentication attempt.
     */
    class AuthenticationResult {
        private final boolean success;
        private final String token;
        private final String username;
        private final String role;
        private final String errorMessage;
        private final boolean passwordChangeRequired;

        private AuthenticationResult(Builder builder) {
            this.success = builder.success;
            this.token = builder.token;
            this.username = builder.username;
            this.role = builder.role;
            this.errorMessage = builder.errorMessage;
            this.passwordChangeRequired = builder.passwordChangeRequired;
        }

        public static Builder builder() {
            return new Builder();
        }

        public boolean isSuccess() {
            return success;
        }

        public String getToken() {
            return token;
        }

        public String getUsername() {
            return username;
        }

        public String getRole() {
            return role;
        }

        public String getErrorMessage() {
            return errorMessage;
        }

        public boolean isPasswordChangeRequired() {
            return passwordChangeRequired;
        }

        public static class Builder {
            private boolean success;
            private String token;
            private String username;
            private String role;
            private String errorMessage;
            private boolean passwordChangeRequired;

            public Builder success(boolean success) {
                this.success = success;
                return this;
            }

            public Builder token(String token) {
                this.token = token;
                return this;
            }

            public Builder username(String username) {
                this.username = username;
                return this;
            }

            public Builder role(String role) {
                this.role = role;
                return this;
            }

            public Builder errorMessage(String errorMessage) {
                this.errorMessage = errorMessage;
                return this;
            }

            public Builder passwordChangeRequired(boolean passwordChangeRequired) {
                this.passwordChangeRequired = passwordChangeRequired;
                return this;
            }

            public AuthenticationResult build() {
                return new AuthenticationResult(this);
            }
        }
    }
}