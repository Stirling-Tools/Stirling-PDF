package stirling.software.proprietary.security.service;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.PasswordPolicyServiceInterface;

/** Service for validating passwords against configured password policy. */
@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordPolicyService implements PasswordPolicyServiceInterface {

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

        if (password.length() < policy.getMinLength()) {
            errors.put(
                    "minLength",
                    String.format(
                            "Password must be at least %d characters long", policy.getMinLength()));
        }

        if (policy.isRequireSpecialChar() && !SPECIAL_CHAR_PATTERN.matcher(password).find()) {
            errors.put("specialChar", "Password must contain at least one special character");
        }

        if (policy.isRequireNumbers() && !NUMBER_PATTERN.matcher(password).find()) {
            errors.put("number", "Password must contain at least one number");
        }

        if (policy.isRequireUppercase() && !UPPERCASE_PATTERN.matcher(password).find()) {
            errors.put("uppercase", "Password must contain at least one uppercase letter");
        }

        if (policy.isRequireLowercase() && !LOWERCASE_PATTERN.matcher(password).find()) {
            errors.put("lowercase", "Password must contain at least one lowercase letter");
        }

        return errors;
    }

    /**
     * Get the password policy configuration.
     *
     * @return The password policy configuration
     */
    public ApplicationProperties.Security.PasswordPolicy getPolicy() {
        return applicationProperties.getSecurity().getPasswordPolicy();
    }
}
