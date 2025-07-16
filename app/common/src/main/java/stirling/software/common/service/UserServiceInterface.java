package stirling.software.common.service;

public interface UserServiceInterface {
    String getApiKeyForUser(String username);

    String getCurrentUsername();

    long getTotalUsersCount();
}
