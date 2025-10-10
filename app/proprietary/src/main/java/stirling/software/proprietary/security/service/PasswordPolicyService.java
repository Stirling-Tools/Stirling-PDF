package stirling.software.proprietary.security.service;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

/**
 * Service for validating passwords against configured password policy.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordPolicyService {

    private final ApplicationProperties applicationProperties;

    // Regex patterns for password validation
    private static final Pattern SPECIAL_CHAR_PATTERN = Pattern.compile("[^a-zA-Z0-9]");
    private static final Pattern NUMBER_PATTERN = Pattern.compile("[0-9]");
    private static final Pattern UPPERCASE_PATTERN = Pattern.compile("[A-Z]");
    private static final Pattern LOWERCASE_PATTERN = Pattern.compile("[a-z]");

    /**
     * Validate a password against the configured password policy.
     *
     * @param password The password to validate
     * @return true if the password meets all policy requirements
     */
    public boolean validatePassword(String password) {
        return getValidationErrors(password).isEmpty();
    }

    /**
     * Get detailed validation errors for a password.
     *
     * @param password The password to validate
     * @return Map of validation errors (empty if password is valid)
     */
    public Map<String, String> getValidationErrors(String password) {
        Map<String, String> errors = new HashMap<>();
        ApplicationProperties.Security.PasswordPolicy policy =
            applicationProperties.getSecurity().getPasswordPolicy();

        if (password == null || password.isEmpty()) {
            errors.put("required", "Password is required");
            return errors;
        }

        // Check minimum length
        if (password.length() < policy.getMinLength()) {
            errors.put("minLength",
                String.format("Password must be at least %d characters long", policy.getMinLength()));
        }

        // Check special character requirement
        if (policy.isRequireSpecialChar() && !SPECIAL_CHAR_PATTERN.matcher(password).find()) {
            errors.put("specialChar", "Password must contain at least one special character");
        }

        // Check number requirement
        if (policy.isRequireNumbers() && !NUMBER_PATTERN.matcher(password).find()) {
            errors.put("number", "Password must contain at least one number");
        }

        // Check uppercase requirement
        if (policy.isRequireUppercase() && !UPPERCASE_PATTERN.matcher(password).find()) {
            errors.put("uppercase", "Password must contain at least one uppercase letter");
        }

        // Check lowercase requirement
        if (policy.isRequireLowercase() && !LOWERCASE_PATTERN.matcher(password).find()) {
            errors.put("lowercase", "Password must contain at least one lowercase letter");
        }

        return errors;
    }

    /**
     * Generate a password policy description for user display.
     *
     * @return Human-readable description of password requirements
     */
    public String getPolicyDescription() {
        ApplicationProperties.Security.PasswordPolicy policy =
            applicationProperties.getSecurity().getPasswordPolicy();

        StringBuilder description = new StringBuilder("Password must:");
        description.append(String.format("\n• Be at least %d characters long", policy.getMinLength()));

        if (policy.isRequireSpecialChar()) {
            description.append("\n• Contain at least one special character (!@#$%^&*...)");
        }

        if (policy.isRequireNumbers()) {
            description.append("\n• Contain at least one number (0-9)");
        }

        if (policy.isRequireUppercase()) {
            description.append("\n• Contain at least one uppercase letter (A-Z)");
        }

        if (policy.isRequireLowercase()) {
            description.append("\n• Contain at least one lowercase letter (a-z)");
        }

        return description.toString();
    }

    /**
     * Check if a password has been used before (if history is enabled).
     * This would need to be implemented with database support for password history.
     *
     * @param userId The user ID
     * @param password The password to check
     * @return true if the password has been used before
     */
    public boolean isPasswordInHistory(Long userId, String password) {
        ApplicationProperties.Security.PasswordPolicy policy =
            applicationProperties.getSecurity().getPasswordPolicy();

        if (policy.getHistoryCount() <= 0) {
            return false; // History check disabled
        }

        // TODO: Implement password history check with database
        // This would require a password_history table and comparison logic
        log.debug("Password history check not yet implemented");
        return false;
    }

    /**
     * Check if a password has expired based on the configured max age.
     *
     * @param passwordChangedAt The timestamp when the password was last changed
     * @return true if the password has expired
     */
    public boolean isPasswordExpired(java.time.LocalDateTime passwordChangedAt) {
        ApplicationProperties.Security.PasswordPolicy policy =
            applicationProperties.getSecurity().getPasswordPolicy();

        if (policy.getMaxAge() <= 0) {
            return false; // Password expiry disabled
        }

        java.time.LocalDateTime expiryDate = passwordChangedAt.plusDays(policy.getMaxAge());
        return java.time.LocalDateTime.now().isAfter(expiryDate);
    }

    /**
     * Get the password policy configuration.
     *
     * @return The password policy configuration
     */
    public ApplicationProperties.Security.PasswordPolicy getPolicy() {
        return applicationProperties.getSecurity().getPasswordPolicy();
    }

    /**
     * Check if password policy enforcement is enabled.
     *
     * @return true if password policy should be enforced
     */
    public boolean isPolicyEnabled() {
        return applicationProperties.getSecurity().getEnableLogin() != null
            && applicationProperties.getSecurity().getEnableLogin();
    }
}