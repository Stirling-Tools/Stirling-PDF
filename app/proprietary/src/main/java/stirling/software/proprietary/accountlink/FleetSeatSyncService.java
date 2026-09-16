package stirling.software.proprietary.accountlink;

import java.io.IOException;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.exception.UserLimitExceededException;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(
        name = "stirling.billing.account-link.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class FleetSeatSyncService {
    private final DeviceCredentialStore credentials;
    private final AccountLinkClient client;
    private final ObjectProvider<UserService> users;
    private final UserLicenseSettingsService settings;

    public FleetSeatSyncService(
            DeviceCredentialStore credentials,
            AccountLinkClient client,
            ObjectProvider<UserService> users,
            UserLicenseSettingsService settings) {
        this.credentials = credentials;
        this.client = client;
        this.users = users;
        this.settings = settings;
    }

    /**
     * Requires the local admission lock; cloud reservations are reconciled after a failed local
     * insert.
     */
    public void claim(long currentUsers) {
        var credential = credentials.get().orElse(null);
        if (credential == null || settings.hasLicenseKeyPaidTier()) return;
        try {
            var result = client.reportSeats(credential, Math.toIntExact(currentUsers), true);
            if (result.unreportedInstances() > 0) {
                throw new IllegalStateException(
                        "A linked deployment has not reported its users. Update or unlink it before adding users.");
            }
            if (!result.allowed()) {
                throw new UserLimitExceededException(result.usersInUse(), result.capacity());
            }
        } catch (IOException e) {
            throw new IllegalStateException(
                    "Cannot verify fleet capacity. Reconnect to your Stirling account before adding users.",
                    e);
        }
    }

    /**
     * Serializing reports with admission prevents an older local count from releasing a seat being
     * created.
     */
    @Scheduled(fixedDelay = 300000, initialDelay = 30000)
    @Transactional
    public void report() {
        var credential = credentials.get().orElse(null);
        if (credential == null) return;
        settings.lockForUserAdmission();
        int count =
                settings.hasLicenseKeyPaidTier()
                        ? 0
                        : Math.toIntExact(users.getObject().getTotalUsersCount());
        try {
            client.reportSeats(credential, count, false);
        } catch (IOException | RuntimeException e) {
            log.debug("Fleet seat report unavailable: {}", e.getClass().getSimpleName());
        }
    }
}
