package stirling.software.proprietary.security.model.exception;

/**
 * Thrown when creating a user would take the installation past the licence's user limit.
 *
 * <p>This is the last line of defence inside {@code UserService.saveUserCore}. Callers that can
 * present a useful message are expected to check {@code
 * UserLicenseSettingsService.wouldExceedLimit} first and fail with their own response; reaching
 * this exception means a code path was added that forgot to.
 *
 * <p>Unchecked so that adding the guard does not change the signature of every method between a
 * controller and {@code saveUserCore}.
 */
public class UserLimitExceededException extends RuntimeException {

    private final long currentUsers;
    private final int maxAllowedUsers;

    public UserLimitExceededException(long currentUsers, int maxAllowedUsers) {
        super(
                "Maximum number of users reached. Allowed: "
                        + maxAllowedUsers
                        + ", current: "
                        + currentUsers);
        this.currentUsers = currentUsers;
        this.maxAllowedUsers = maxAllowedUsers;
    }

    public long getCurrentUsers() {
        return currentUsers;
    }

    public int getMaxAllowedUsers() {
        return maxAllowedUsers;
    }
}
