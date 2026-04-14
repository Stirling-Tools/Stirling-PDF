package stirling.software.common.service;

public interface UserServiceInterface {
    String getApiKeyForUser(String username);

    String getCurrentUsername();

    String getCurrentUserApiKey();

    long getTotalUsersCount();

    boolean isCurrentUserAdmin();

    boolean isCurrentUserFirstLogin();
}
