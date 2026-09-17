package stirling.software.common.service;

public interface UserServiceInterface {
    String getApiKeyForUser(String username);

    String getCurrentUsername();

    String getCurrentUserApiKey();

    long getTotalUsersCount();

    /**
     * Whether a user is stored under exactly this name. Exact, not case-insensitive: callers use it
     * to decide whether a record stamped with an owner name is still reachable, and reachability is
     * decided by an exact name match.
     */
    boolean usernameExists(String username);

    boolean isCurrentUserAdmin();

    boolean isCurrentUserFirstLogin();
}
