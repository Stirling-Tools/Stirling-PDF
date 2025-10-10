package stirling.software.proprietary.security.service;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;

/**
 * Service for enforcing user limits based on license.
 * Free tier is limited to 5 users.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UserLimitEnforcementService {

    private static final int FREE_TIER_USER_LIMIT = 5;

    private final UserService userService;
    private final ApplicationProperties applicationProperties;

    /**
     * Check if a new user can be created based on license limits.
     *
     * @return true if a new user can be created
     */
    public boolean canCreateUser() {
        int currentUserCount = getUserCount();
        int maxUsers = getMaxUserLimit();

        if (maxUsers == -1) {
            // Unlimited users
            return true;
        }

        boolean canCreate = currentUserCount < maxUsers;

        if (!canCreate) {
            log.warn("User limit reached: {} / {} users", currentUserCount, maxUsers);
        }

        return canCreate;
    }

    /**
     * Get the current user count (excluding internal/system users).
     *
     * @return The number of active users
     */
    public int getUserCount() {
        // Use existing method from UserService that already excludes internal API user
        return (int) userService.getTotalUsersCount();
    }

    /**
     * Get the maximum allowed users based on license.
     *
     * @return The maximum user limit or -1 for unlimited
     */
    public int getMaxUserLimit() {
        ApplicationProperties.Premium premium = applicationProperties.getPremium();

        // Check if premium/enterprise is enabled
        if (premium != null && premium.isEnabled()) {
            // Check if a valid license key is present
            String licenseKey = premium.getKey();
            if (licenseKey != null && !licenseKey.trim().isEmpty()
                && !licenseKey.equals("00000000-0000-0000-0000-000000000000")) {

                // Get max users from premium settings
                int maxUsers = premium.getMaxUsers();

                // If maxUsers is 0 or negative, treat as unlimited
                if (maxUsers <= 0) {
                    return -1; // Unlimited
                }

                return maxUsers;
            }
        }

        // Default to free tier limit
        return FREE_TIER_USER_LIMIT;
    }

    /**
     * Check if the system is running in free tier mode.
     *
     * @return true if running in free tier (5 user limit)
     */
    public boolean isFreeTier() {
        return getMaxUserLimit() == FREE_TIER_USER_LIMIT;
    }

    /**
     * Get remaining user slots available.
     *
     * @return Number of users that can still be created, or -1 for unlimited
     */
    public int getRemainingUserSlots() {
        int maxUsers = getMaxUserLimit();
        if (maxUsers == -1) {
            return -1; // Unlimited
        }

        int currentUsers = getUserCount();
        return Math.max(0, maxUsers - currentUsers);
    }

    /**
     * Validate that creating a user won't exceed limits.
     *
     * @throws UserLimitExceededException if limit would be exceeded
     */
    public void validateUserCreation() throws UserLimitExceededException {
        if (!canCreateUser()) {
            int currentCount = getUserCount();
            int maxLimit = getMaxUserLimit();

            String message;
            if (isFreeTier()) {
                message = String.format(
                    "User limit exceeded. Free tier is limited to %d users. Current count: %d. " +
                    "Please upgrade to a premium license to add more users.",
                    maxLimit, currentCount
                );
            } else {
                message = String.format(
                    "User limit exceeded. Your license allows %d users. Current count: %d.",
                    maxLimit, currentCount
                );
            }

            throw new UserLimitExceededException(message);
        }
    }

    /**
     * Get a user-friendly message about the current license status.
     *
     * @return License status message
     */
    public String getLicenseStatusMessage() {
        int currentUsers = getUserCount();
        int maxUsers = getMaxUserLimit();

        if (maxUsers == -1) {
            return String.format("Unlimited user license. Current users: %d", currentUsers);
        } else if (isFreeTier()) {
            return String.format("Free tier: %d / %d users", currentUsers, maxUsers);
        } else {
            return String.format("Premium license: %d / %d users", currentUsers, maxUsers);
        }
    }

    /**
     * Exception thrown when user limit is exceeded.
     */
    public static class UserLimitExceededException extends Exception {
        public UserLimitExceededException(String message) {
            super(message);
        }
    }
}