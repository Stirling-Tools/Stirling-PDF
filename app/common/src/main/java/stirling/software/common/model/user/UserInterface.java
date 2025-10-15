package stirling.software.common.model.user;

import java.util.Collection;
import java.util.Map;

/**
 * Interface representing a user in the system. This interface allows the common module to work with
 * users without depending on the proprietary User entity. Proprietary implementations should extend
 * both this interface and Spring Security's UserDetails.
 */
public interface UserInterface {

    /**
     * Gets the unique identifier for this user.
     *
     * @return the user ID
     */
    Long getId();

    /**
     * Gets the API key for this user.
     *
     * @return the API key, or null if not set
     */
    String getApiKey();

    /**
     * Sets the API key for this user.
     *
     * @param apiKey the new API key
     */
    void setApiKey(String apiKey);

    /**
     * Gets the user's authentication type (e.g., "web", "sso", "oauth2", "saml2").
     *
     * @return the authentication type
     */
    String getAuthenticationType();

    /**
     * Checks if this is the user's first login.
     *
     * @return true if first login, false otherwise
     */
    boolean isFirstLogin();

    /**
     * Sets the first login flag.
     *
     * @param firstLogin true if this is first login, false otherwise
     */
    void setFirstLogin(boolean firstLogin);

    /**
     * Gets the user's role name (e.g., "User", "Admin").
     *
     * @return the role name
     */
    String getRoleName();

    /**
     * Gets all roles as a comma-separated string.
     *
     * @return roles as string
     */
    String getRolesAsString();

    /**
     * Gets the user's custom settings.
     *
     * @return map of setting key-value pairs
     */
    Map<String, String> getSettings();

    /**
     * Sets the user's custom settings.
     *
     * @param settings map of setting key-value pairs
     */
    void setSettings(Map<String, String> settings);

    /**
     * Checks if the user has a password set.
     *
     * @return true if password exists, false otherwise
     */
    boolean hasPassword();

    /**
     * Sets the username for this user.
     *
     * @param username the new username
     */
    void setUsername(String username);

    /**
     * Sets the password for this user.
     *
     * @param password the new password (should be encoded)
     */
    void setPassword(String password);

    /**
     * Checks if the user account is enabled.
     *
     * @return true if enabled, false otherwise
     */
    boolean isEnabled();

    /**
     * Sets whether the user account is enabled.
     *
     * @param enabled true to enable, false to disable
     */
    void setEnabled(boolean enabled);

    /**
     * Gets the username used for authentication.
     *
     * @return the username
     */
    String getUsername();

    /**
     * Gets the password (encoded).
     *
     * @return the encoded password
     */
    String getPassword();

    /**
     * Gets the user's granted authorities/roles.
     *
     * @return collection of granted authorities
     */
    Collection<?> getAuthorities();
}
