package stirling.software.common.service;

/**
 * Service interface for tracking login attempts and preventing brute force attacks. Implementations
 * should track failed login attempts and block users/IPs after exceeding configured thresholds.
 */
public interface LoginAttemptServiceInterface {

    /**
     * Records a successful login, clearing any failed attempt counters.
     *
     * @param key the username or IP address
     */
    void loginSucceeded(String key);

    /**
     * Records a failed login attempt, incrementing the failure counter.
     *
     * @param key the username or IP address
     */
    void loginFailed(String key);

    /**
     * Checks if a user/IP is currently blocked due to too many failed attempts.
     *
     * @param key the username or IP address
     * @return true if blocked, false otherwise
     */
    boolean isBlocked(String key);

    /**
     * Gets the number of remaining login attempts before blocking.
     *
     * @param key the username or IP address
     * @return number of remaining attempts, or 0 if already blocked
     */
    int getRemainingAttempts(String key);
}
