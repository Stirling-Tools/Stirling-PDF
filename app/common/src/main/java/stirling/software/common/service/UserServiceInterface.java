package stirling.software.common.service;

import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import stirling.software.common.model.user.UserInterface;

/**
 * Service interface for user management operations. Implementations handle user CRUD operations,
 * authentication, and account management.
 *
 * @param <U> the user type that implements UserInterface
 * @param <T> the team type (implementation-specific)
 */
public interface UserServiceInterface<U extends UserInterface, T> {

    // ==================== User Query Methods ====================

    /**
     * Finds a user by username (case-sensitive).
     *
     * @param username the username to search for
     * @return Optional containing the user if found
     */
    Optional<U> findByUsername(String username);

    /**
     * Finds a user by username (case-insensitive).
     *
     * @param username the username to search for
     * @return Optional containing the user if found
     */
    Optional<U> findByUsernameIgnoreCase(String username);

    /**
     * Finds a user by username with settings eagerly loaded.
     *
     * @param username the username to search for
     * @return Optional containing the user with settings if found
     */
    Optional<U> findByUsernameIgnoreCaseWithSettings(String username);

    /**
     * Checks if a username exists (case-sensitive).
     *
     * @param username the username to check
     * @return true if username exists
     */
    boolean usernameExists(String username);

    /**
     * Checks if a username exists (case-insensitive).
     *
     * @param username the username to check
     * @return true if username exists
     */
    boolean usernameExistsIgnoreCase(String username);

    /**
     * Checks if any users exist in the system.
     *
     * @return true if at least one user exists
     */
    boolean hasUsers();

    /**
     * Checks if a user is disabled.
     *
     * @param username the username to check
     * @return true if user is disabled
     */
    boolean isUserDisabled(String username);

    /**
     * Checks if a user has a password set.
     *
     * @param username the username to check
     * @return true if user has a password
     */
    boolean hasPassword(String username);

    /**
     * Gets the total count of users (excluding internal users).
     *
     * @return the number of users
     */
    long getTotalUsersCount();

    /**
     * Gets all users without a team assignment.
     *
     * @return list of users without teams
     */
    List<U> getUsersWithoutTeam();

    /**
     * Gets the currently authenticated username.
     *
     * @return the current username, or null if not authenticated
     */
    String getCurrentUsername();

    // ==================== User Creation Methods ====================

    /**
     * Saves a new user with password and team ID.
     *
     * @param username the username
     * @param password the password (will be encoded)
     * @param teamId the team ID to assign
     * @return the saved user
     * @throws IllegalArgumentException if username or password is invalid
     * @throws SQLException if database operation fails
     */
    U saveUser(String username, String password, Long teamId)
            throws IllegalArgumentException, SQLException;

    /**
     * Saves a new user with password, team, role, and first login flag.
     *
     * @param username the username
     * @param password the password (will be encoded)
     * @param team the team object to assign
     * @param role the role to assign
     * @param firstLogin whether this is first login
     * @return the saved user
     * @throws IllegalArgumentException if username or password is invalid
     * @throws SQLException if database operation fails
     */
    U saveUser(String username, String password, T team, String role, boolean firstLogin)
            throws IllegalArgumentException, SQLException;

    /**
     * Saves a new user with full parameters.
     *
     * @param username the username
     * @param password the password (will be encoded)
     * @param teamId the team ID to assign
     * @param role the role to assign
     * @param firstLogin whether this is first login
     * @return the saved user
     * @throws IllegalArgumentException if username or password is invalid
     * @throws SQLException if database operation fails
     */
    U saveUser(String username, String password, Long teamId, String role, boolean firstLogin)
            throws IllegalArgumentException, SQLException;

    /**
     * Saves a new user with password, team ID, role, first login, and enabled status.
     *
     * @param username the username
     * @param password the password (will be encoded)
     * @param teamId the team ID to assign
     * @param firstLogin whether this is first login
     * @param enabled whether the account is enabled
     * @throws IllegalArgumentException if username or password is invalid
     * @throws SQLException if database operation fails
     */
    void saveUser(
            String username, String password, Long teamId, boolean firstLogin, boolean enabled)
            throws IllegalArgumentException, SQLException;

    /**
     * Batch saves multiple users.
     *
     * @param users the list of users to save
     */
    void saveAll(List<U> users);

    // ==================== User Modification Methods ====================

    /**
     * Changes a user's username.
     *
     * @param user the user to update
     * @param newUsername the new username
     * @throws IllegalArgumentException if new username is invalid
     * @throws SQLException if database operation fails
     */
    void changeUsername(U user, String newUsername) throws IllegalArgumentException, SQLException;

    /**
     * Changes a user's password.
     *
     * @param user the user to update
     * @param newPassword the new password (will be encoded)
     * @throws SQLException if database operation fails
     */
    void changePassword(U user, String newPassword) throws SQLException;

    /**
     * Changes a user's first login flag.
     *
     * @param user the user to update
     * @param firstUse the new first login value
     * @throws SQLException if database operation fails
     */
    void changeFirstUse(U user, boolean firstUse) throws SQLException;

    /**
     * Changes a user's role.
     *
     * @param user the user to update
     * @param newRole the new role ID
     * @throws SQLException if database operation fails
     */
    void changeRole(U user, String newRole) throws SQLException;

    /**
     * Enables or disables a user account.
     *
     * @param user the user to update
     * @param enabled true to enable, false to disable
     * @throws SQLException if database operation fails
     */
    void changeUserEnabled(U user, Boolean enabled) throws SQLException;

    /**
     * Changes a user's team assignment.
     *
     * @param user the user to update
     * @param team the new team (null for default team)
     * @throws SQLException if database operation fails
     */
    void changeUserTeam(U user, T team) throws SQLException;

    /**
     * Updates a user's custom settings.
     *
     * @param username the username
     * @param updates map of setting keys to values
     * @throws SQLException if database operation fails
     */
    void updateUserSettings(String username, Map<String, String> updates) throws SQLException;

    /**
     * Deletes a user by username.
     *
     * @param username the username to delete
     */
    void deleteUser(String username);

    // ==================== Authentication & Validation Methods ====================

    /**
     * Checks if a password is correct for a user.
     *
     * @param user the user to check
     * @param currentPassword the password to verify
     * @return true if password matches
     */
    boolean isPasswordCorrect(U user, String currentPassword);

    /**
     * Validates a username format.
     *
     * @param username the username to validate
     * @return true if username is valid
     */
    boolean isUsernameValid(String username);

    /**
     * Gets an Authentication object from an API key. The return type is Object to avoid
     * dependencies on Spring Security in the common module. Implementations should return
     * org.springframework.security.core.Authentication.
     *
     * @param apiKey the API key
     * @return the Authentication object (Spring Security Authentication)
     */
    Object getAuthentication(String apiKey);

    // ==================== API Key Methods ====================

    /**
     * Gets the API key for a user. Creates one if it doesn't exist.
     *
     * @param username the username
     * @return the API key
     */
    String getApiKeyForUser(String username);

    /**
     * Refreshes (regenerates) the API key for a user.
     *
     * @param username the username
     * @return the user with new API key
     */
    U refreshApiKeyForUser(String username);

    /**
     * Validates an API key.
     *
     * @param apiKey the API key to validate
     * @return true if valid
     */
    boolean isValidApiKey(String apiKey);

    /**
     * Gets a user by their API key.
     *
     * @param apiKey the API key
     * @return Optional containing the user if found
     */
    Optional<U> getUserByApiKey(String apiKey);

    /**
     * Validates an API key for a specific user.
     *
     * @param username the username
     * @param apiKey the API key to validate
     * @return true if the API key belongs to the user
     */
    boolean validateApiKeyForUser(String username, String apiKey);

    // ==================== Session Management Methods ====================

    /**
     * Invalidates all sessions for a user.
     *
     * @param username the username
     */
    void invalidateUserSessions(String username);
}
