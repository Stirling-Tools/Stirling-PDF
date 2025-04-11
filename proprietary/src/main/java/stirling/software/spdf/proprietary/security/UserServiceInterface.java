package stirling.software.spdf.proprietary.security;

public interface UserServiceInterface {
    String getApiKeyForUser(String username);

    String getCurrentUsername();

    long getTotalUsersCount();
}
