package stirling.software.common.service;

import java.util.Map;

import stirling.software.common.model.ApplicationProperties;

/**
 * Service interface for password policy validation. Implementations should validate passwords
 * against configured security policies.
 */
public interface PasswordPolicyServiceInterface {

    /**
     * Validates a password against the configured password policy.
     *
     * @param password the password to validate
     * @return true if password meets all requirements, false otherwise
     */
    boolean validatePassword(String password);

    /**
     * Gets detailed validation errors for a password.
     *
     * @param password the password to validate
     * @return map of error keys to error messages, empty if password is valid
     */
    Map<String, String> getValidationErrors(String password);

    /**
     * Gets the current password policy configuration.
     *
     * @return the password policy settings
     */
    ApplicationProperties.Security.PasswordPolicy getPolicy();
}
