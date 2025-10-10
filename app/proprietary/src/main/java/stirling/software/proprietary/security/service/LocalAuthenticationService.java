package stirling.software.proprietary.security.service;

import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.common.service.LocalAuthenticationServiceInterface;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;

/**
 * Local database authentication service implementation.
 * Handles user authentication, password management, and session control.
 */
@Slf4j
@Service
@Qualifier("localAuthenticationService")
public class LocalAuthenticationService implements LocalAuthenticationServiceInterface {

    private final UserService userService;
    private final JwtServiceInterface jwtService;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicyService passwordPolicyService;
    private final LoginAttemptService loginAttemptService;
    private final ApplicationProperties applicationProperties;
    private final EmailService emailService;
    private final DatabaseServiceInterface databaseService;

    // In-memory storage for password reset tokens (should be moved to database in production)
    private final Map<String, PasswordResetToken> resetTokens = new HashMap<>();

    public LocalAuthenticationService(
            UserService userService,
            JwtServiceInterface jwtService,
            PasswordEncoder passwordEncoder,
            PasswordPolicyService passwordPolicyService,
            LoginAttemptService loginAttemptService,
            ApplicationProperties applicationProperties,
            EmailService emailService,
            DatabaseServiceInterface databaseService) {
        this.userService = userService;
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
        this.passwordPolicyService = passwordPolicyService;
        this.loginAttemptService = loginAttemptService;
        this.applicationProperties = applicationProperties;
        this.emailService = emailService;
        this.databaseService = databaseService;
    }

    @Override
    @Transactional
    public AuthenticationResult authenticate(String username, String password) {
        log.debug("Attempting authentication for user: {}", username);

        try {
            // Check if account is locked due to too many attempts
            if (loginAttemptService.isBlocked(username)) {
                log.warn("Authentication failed: Account locked for user {}", username);
                return AuthenticationResult.builder()
                    .success(false)
                    .errorMessage("Account is locked due to too many failed login attempts")
                    .build();
            }

            // Find user
            Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);
            if (userOpt.isEmpty()) {
                loginAttemptService.loginFailed(username);
                log.warn("Authentication failed: User not found {}", username);
                return AuthenticationResult.builder()
                    .success(false)
                    .errorMessage("Invalid username or password")
                    .build();
            }

            User user = userOpt.get();

            // Check if user is enabled
            if (!user.isEnabled()) {
                log.warn("Authentication failed: User disabled {}", username);
                return AuthenticationResult.builder()
                    .success(false)
                    .errorMessage("Account is disabled")
                    .build();
            }

            // Check authentication type
            if (!AuthenticationType.WEB.toString().equalsIgnoreCase(user.getAuthenticationType())) {
                log.warn("Authentication failed: Wrong authentication type for user {}", username);
                return AuthenticationResult.builder()
                    .success(false)
                    .errorMessage("This account uses a different authentication method")
                    .build();
            }

            // Verify password
            if (!passwordEncoder.matches(password, user.getPassword())) {
                loginAttemptService.loginFailed(username);
                log.warn("Authentication failed: Invalid password for user {}", username);
                return AuthenticationResult.builder()
                    .success(false)
                    .errorMessage("Invalid username or password")
                    .build();
            }

            // Reset login attempts on successful authentication
            loginAttemptService.loginSucceeded(username);

            // Generate JWT token
            Map<String, Object> claims = new HashMap<>();
            claims.put("userId", user.getId());
            claims.put("role", user.getRoleName());

            String token = jwtService.generateToken(username, claims);

            // Check if password change is required
            boolean passwordChangeRequired = user.isFirstLogin();

            // Get user role
            String role = user.getAuthorities().stream()
                .map(Authority::getAuthority)
                .findFirst()
                .orElse("USER");

            log.info("Authentication successful for user: {}", username);

            return AuthenticationResult.builder()
                .success(true)
                .token(token)
                .username(username)
                .role(role)
                .passwordChangeRequired(passwordChangeRequired)
                .build();

        } catch (Exception e) {
            log.error("Authentication error for user {}: {}", username, e.getMessage(), e);
            return AuthenticationResult.builder()
                .success(false)
                .errorMessage("An error occurred during authentication")
                .build();
        }
    }

    @Override
    public void logout(String token) {
        // JWT tokens are stateless, so we can't truly invalidate them server-side
        // In a production system, you might want to maintain a blacklist of revoked tokens
        // or use refresh tokens that can be revoked
        log.info("User logout requested");
    }

    @Override
    public boolean validatePassword(String password) {
        return passwordPolicyService.validatePassword(password);
    }

    @Override
    public Map<String, String> getPasswordValidationErrors(String password) {
        return passwordPolicyService.getValidationErrors(password);
    }

    @Override
    @Transactional
    public boolean initiatePasswordReset(String emailOrUsername) {
        try {
            Optional<User> userOpt = userService.findByUsernameIgnoreCase(emailOrUsername);

            if (userOpt.isEmpty()) {
                // Don't reveal whether the user exists
                log.debug("Password reset requested for non-existent user: {}", emailOrUsername);
                return true;
            }

            User user = userOpt.get();

            // Generate reset token
            String token = UUID.randomUUID().toString();
            LocalDateTime expiresAt = LocalDateTime.now().plusHours(1);

            // Store token (should be in database in production)
            resetTokens.put(token, new PasswordResetToken(user.getId(), token, expiresAt));

            // Send email (if email service is configured)
            if (applicationProperties.getMail() != null && applicationProperties.getMail().isEnabled()) {
                String resetLink = applicationProperties.getSecurity().getEnableLogin()
                    ? "/password-reset?token=" + token
                    : "";

                emailService.sendPasswordResetEmail(user.getUsername(), resetLink);
            }

            log.info("Password reset initiated for user: {}", user.getUsername());
            return true;

        } catch (Exception e) {
            log.error("Error initiating password reset: {}", e.getMessage(), e);
            return false;
        }
    }

    @Override
    @Transactional
    public boolean resetPassword(String token, String newPassword) {
        try {
            // Validate token
            PasswordResetToken resetToken = resetTokens.get(token);
            if (resetToken == null) {
                log.warn("Invalid password reset token: {}", token);
                return false;
            }

            // Check if token is expired
            if (resetToken.isExpired()) {
                log.warn("Expired password reset token: {}", token);
                resetTokens.remove(token);
                return false;
            }

            // Validate new password
            if (!validatePassword(newPassword)) {
                log.warn("New password doesn't meet policy requirements");
                return false;
            }

            // Find user
            Optional<User> userOpt = userService.findByUsernameIgnoreCase(
                String.valueOf(resetToken.getUserId()));
            if (userOpt.isEmpty()) {
                log.error("User not found for password reset: {}", resetToken.getUserId());
                return false;
            }

            User user = userOpt.get();

            // Update password
            userService.changePassword(user, newPassword);

            // Clear first login flag if set
            if (user.isFirstLogin()) {
                userService.changeFirstUse(user, false);
            }

            // Remove used token
            resetTokens.remove(token);

            log.info("Password reset successful for user: {}", user.getUsername());
            return true;

        } catch (Exception e) {
            log.error("Error resetting password: {}", e.getMessage(), e);
            return false;
        }
    }

    @Override
    @Transactional
    public boolean changePassword(String username, String oldPassword, String newPassword) {
        try {
            Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);

            if (userOpt.isEmpty()) {
                log.warn("User not found for password change: {}", username);
                return false;
            }

            User user = userOpt.get();

            // Verify old password
            if (!userService.isPasswordCorrect(user, oldPassword)) {
                log.warn("Invalid old password for user: {}", username);
                return false;
            }

            // Validate new password
            if (!validatePassword(newPassword)) {
                log.warn("New password doesn't meet policy requirements for user: {}", username);
                return false;
            }

            // Check if new password is same as old
            if (passwordEncoder.matches(newPassword, user.getPassword())) {
                log.warn("New password is same as old password for user: {}", username);
                return false;
            }

            // Update password
            userService.changePassword(user, newPassword);

            // Clear first login flag if set
            if (user.isFirstLogin()) {
                userService.changeFirstUse(user, false);
            }

            log.info("Password changed successfully for user: {}", username);
            return true;

        } catch (SQLException | UnsupportedProviderException e) {
            log.error("Error changing password for user {}: {}", username, e.getMessage(), e);
            return false;
        }
    }

    @Override
    public boolean isPasswordChangeRequired(String username) {
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);

        if (userOpt.isEmpty()) {
            return false;
        }

        User user = userOpt.get();

        // Check if first login
        if (user.isFirstLogin()) {
            return true;
        }

        // Check if password is expired (would need to track password change date)
        // This would require adding a password_changed_at field to the User entity

        return false;
    }

    /**
     * Inner class for password reset tokens.
     * In production, this should be a database entity.
     */
    private static class PasswordResetToken {
        private final Long userId;
        private final String token;
        private final LocalDateTime expiresAt;

        public PasswordResetToken(Long userId, String token, LocalDateTime expiresAt) {
            this.userId = userId;
            this.token = token;
            this.expiresAt = expiresAt;
        }

        public Long getUserId() {
            return userId;
        }

        public String getToken() {
            return token;
        }

        public LocalDateTime getExpiresAt() {
            return expiresAt;
        }

        public boolean isExpired() {
            return LocalDateTime.now().isAfter(expiresAt);
        }
    }
}