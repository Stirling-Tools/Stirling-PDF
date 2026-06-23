package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.beans.factory.ObjectProvider;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.model.UserLicenseSettings;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;
import stirling.software.proprietary.security.repository.UserLicenseSettingsRepository;
import stirling.software.proprietary.security.service.UserService;

/**
 * Additional coverage for {@link UserLicenseSettingsService} focusing on initialization, integrity
 * signing/validation, license-max-user sync, and slot calculations not covered by the primary test.
 * Uses a real {@link ApplicationProperties} so the HMAC integrity signing path runs end to end.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserLicenseSettingsServiceMoreTest {

    @Mock private UserLicenseSettingsRepository settingsRepository;
    @Mock private UserService userService;
    @Mock private LicenseKeyChecker licenseKeyChecker;
    @Mock private ObjectProvider<LicenseKeyChecker> licenseKeyCheckerProvider;

    private ApplicationProperties applicationProperties;
    private UserLicenseSettingsService service;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        applicationProperties.getAutomaticallyGenerated().setKey("auto-key");
        applicationProperties.getAutomaticallyGenerated().setUUID("auto-uuid");

        when(settingsRepository.save(any(UserLicenseSettings.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(licenseKeyCheckerProvider.getIfAvailable()).thenReturn(licenseKeyChecker);
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

        service =
                new UserLicenseSettingsService(
                        settingsRepository,
                        userService,
                        applicationProperties,
                        licenseKeyCheckerProvider);
    }

    // Saves a freshly initialized + locked settings row with a valid signature.
    private UserLicenseSettings lockedSettings(int count) {
        UserLicenseSettings s = new UserLicenseSettings();
        s.setId(UserLicenseSettings.SINGLETON_ID);
        s.setGrandfatheredUserCount(count);
        s.setGrandfatheringLocked(true);
        s.setIntegritySalt("fixed-salt");
        s.setLicenseMaxUsers(0);
        when(settingsRepository.findSettings()).thenReturn(Optional.of(s));
        // First validation has a blank signature; align restore-count with the intended value
        // so the generated signature matches, then a real signature is persisted on the row.
        when(userService.getTotalUsersCount()).thenReturn((long) count);
        service.validateSettingsIntegrity();
        return s;
    }

    @Nested
    @DisplayName("getOrCreateSettings")
    class GetOrCreateSettings {

        @Test
        @DisplayName("creates and saves a new settings row when none exists")
        void createsWhenMissing() {
            when(settingsRepository.findSettings()).thenReturn(Optional.empty());

            UserLicenseSettings result = service.getOrCreateSettings();

            assertThat(result.getId()).isEqualTo(UserLicenseSettings.SINGLETON_ID);
            assertThat(result.getGrandfatheredUserCount()).isZero();
            assertThat(result.isGrandfatheringLocked()).isFalse();
            assertThat(result.getIntegritySalt()).isNotBlank();
            verify(settingsRepository).save(any(UserLicenseSettings.class));
        }

        @Test
        @DisplayName("returns the existing row without creating a new one")
        void returnsExisting() {
            UserLicenseSettings existing = new UserLicenseSettings();
            existing.setGrandfatheredUserCount(42);
            when(settingsRepository.findSettings()).thenReturn(Optional.of(existing));

            UserLicenseSettings result = service.getOrCreateSettings();

            assertThat(result.getGrandfatheredUserCount()).isEqualTo(42);
            verify(settingsRepository, never()).save(any(UserLicenseSettings.class));
        }
    }

    @Nested
    @DisplayName("initializeGrandfatheredCount")
    class InitializeGrandfatheredCount {

        @Test
        @DisplayName("fresh installation locks the default limit of 5")
        void freshInstall_locksDefault() {
            UserLicenseSettings s = new UserLicenseSettings();
            s.setIntegritySalt("salt");
            when(settingsRepository.findSettings()).thenReturn(Optional.of(s));
            when(userService.getTotalUsersCount()).thenReturn(0L);

            service.initializeGrandfatheredCount();

            assertThat(s.getGrandfatheredUserCount()).isEqualTo(5);
            assertThat(s.isGrandfatheringLocked()).isTrue();
            assertThat(s.getGrandfatheredUserSignature()).isNotBlank();
        }

        @Test
        @DisplayName("existing installation grandfathers current user count")
        void existingInstall_grandfathersUserCount() {
            UserLicenseSettings s = new UserLicenseSettings();
            s.setIntegritySalt("salt");
            when(settingsRepository.findSettings()).thenReturn(Optional.of(s));
            when(userService.getTotalUsersCount()).thenReturn(37L);

            service.initializeGrandfatheredCount();

            assertThat(s.getGrandfatheredUserCount()).isEqualTo(37);
            assertThat(s.isGrandfatheringLocked()).isTrue();
        }

        @Test
        @DisplayName("already-locked settings are not re-initialized")
        void alreadyLocked_skips() {
            UserLicenseSettings s = new UserLicenseSettings();
            s.setIntegritySalt("salt");
            s.setGrandfatheringLocked(true);
            s.setGrandfatheredUserCount(99);
            s.setGrandfatheredUserSignature("99:existing");
            when(settingsRepository.findSettings()).thenReturn(Optional.of(s));

            service.initializeGrandfatheredCount();

            assertThat(s.getGrandfatheredUserCount()).isEqualTo(99);
        }

        @Test
        @DisplayName("locked settings with blank signature get a fresh signature")
        void lockedBlankSignature_isResigned() {
            UserLicenseSettings s = new UserLicenseSettings();
            s.setIntegritySalt("salt");
            s.setGrandfatheringLocked(true);
            s.setGrandfatheredUserCount(10);
            s.setGrandfatheredUserSignature("");
            when(settingsRepository.findSettings()).thenReturn(Optional.of(s));

            service.initializeGrandfatheredCount();

            assertThat(s.getGrandfatheredUserSignature()).isNotBlank();
            assertThat(s.getGrandfatheredUserCount()).isEqualTo(10);
        }
    }

    @Nested
    @DisplayName("updateLicenseMaxUsers")
    class UpdateLicenseMaxUsers {

        @Test
        @DisplayName("no paid license keeps licenseMaxUsers at 0")
        void noLicense_keepsZero() {
            UserLicenseSettings s = new UserLicenseSettings();
            s.setIntegritySalt("salt");
            s.setLicenseMaxUsers(0);
            when(settingsRepository.findSettings()).thenReturn(Optional.of(s));
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

            service.updateLicenseMaxUsers();

            assertThat(s.getLicenseMaxUsers()).isZero();
        }

        @Test
        @DisplayName("paid license copies maxUsers from application properties")
        void paidLicense_copiesMaxUsers() {
            applicationProperties.getPremium().setMaxUsers(15);
            UserLicenseSettings s = new UserLicenseSettings();
            s.setIntegritySalt("salt");
            s.setLicenseMaxUsers(0);
            when(settingsRepository.findSettings()).thenReturn(Optional.of(s));
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

            service.updateLicenseMaxUsers();

            assertThat(s.getLicenseMaxUsers()).isEqualTo(15);
        }

        @Test
        @DisplayName("no change when value already matches")
        void noChange_doesNotSaveAgain() {
            applicationProperties.getPremium().setMaxUsers(8);
            UserLicenseSettings s = new UserLicenseSettings();
            s.setIntegritySalt("salt");
            s.setLicenseMaxUsers(8);
            when(settingsRepository.findSettings()).thenReturn(Optional.of(s));
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

            service.updateLicenseMaxUsers();

            assertThat(s.getLicenseMaxUsers()).isEqualTo(8);
            // save only happens once during getOrCreateSettings path is bypassed here; never saved
            verify(settingsRepository, never()).save(any(UserLicenseSettings.class));
        }
    }

    @Nested
    @DisplayName("validateSettingsIntegrity")
    class ValidateSettingsIntegrity {

        @Test
        @DisplayName("missing signature is regenerated from restored count")
        void missingSignature_restored() {
            UserLicenseSettings s = new UserLicenseSettings();
            s.setIntegritySalt("salt");
            s.setGrandfatheredUserCount(20);
            s.setGrandfatheredUserSignature("");
            when(settingsRepository.findSettings()).thenReturn(Optional.of(s));
            when(userService.getTotalUsersCount()).thenReturn(20L);

            service.validateSettingsIntegrity();

            assertThat(s.getGrandfatheredUserSignature()).isNotBlank();
            assertThat(s.getGrandfatheredUserCount()).isGreaterThanOrEqualTo(5);
        }

        @Test
        @DisplayName("tampered count below minimum is forced back to 5")
        void countBelowMinimum_enforced() {
            UserLicenseSettings s = new UserLicenseSettings();
            s.setIntegritySalt("salt");
            s.setGrandfatheredUserCount(2);
            s.setGrandfatheredUserSignature("");
            when(settingsRepository.findSettings()).thenReturn(Optional.of(s));
            when(userService.getTotalUsersCount()).thenReturn(0L);

            service.validateSettingsIntegrity();

            assertThat(s.getGrandfatheredUserCount()).isEqualTo(5);
        }

        @Test
        @DisplayName("a valid signature is preserved across validation")
        void validSignature_preserved() {
            UserLicenseSettings s = lockedSettings(30);
            String signatureAfterFirst = s.getGrandfatheredUserSignature();

            service.validateSettingsIntegrity();

            assertThat(s.getGrandfatheredUserCount()).isEqualTo(30);
            assertThat(s.getGrandfatheredUserSignature()).isEqualTo(signatureAfterFirst);
        }

        @Test
        @DisplayName("count modified without signature update is restored to the signed count")
        void countModifiedAfterSigning_restored() {
            UserLicenseSettings s = lockedSettings(40);
            // Tamper: change count but keep the old (now mismatched) signature.
            s.setGrandfatheredUserCount(500);

            service.validateSettingsIntegrity();

            assertThat(s.getGrandfatheredUserCount()).isEqualTo(40);
        }
    }

    @Nested
    @DisplayName("slot calculations")
    class SlotCalculations {

        @Test
        @DisplayName("wouldExceedLimit true when adding pushes over the cap")
        void wouldExceedLimit_true() {
            lockedSettings(5);
            when(userService.getTotalUsersCount()).thenReturn(5L);

            boolean result = service.wouldExceedLimit(1);

            assertThat(result).isTrue();
        }

        @Test
        @DisplayName("wouldExceedLimit false when within the cap")
        void wouldExceedLimit_false() {
            lockedSettings(10);
            when(userService.getTotalUsersCount()).thenReturn(5L);

            boolean result = service.wouldExceedLimit(2);

            assertThat(result).isFalse();
        }

        @Test
        @DisplayName("getAvailableUserSlots returns remaining capacity")
        void availableSlots_remaining() {
            lockedSettings(10);
            when(userService.getTotalUsersCount()).thenReturn(4L);

            long slots = service.getAvailableUserSlots();

            assertThat(slots).isEqualTo(6);
        }

        @Test
        @DisplayName("getAvailableUserSlots never returns negative")
        void availableSlots_clampedToZero() {
            lockedSettings(5);
            when(userService.getTotalUsersCount()).thenReturn(20L);

            long slots = service.getAvailableUserSlots();

            assertThat(slots).isZero();
        }
    }

    @Nested
    @DisplayName("display + accessors")
    class DisplayAndAccessors {

        @Test
        @DisplayName("display count returns excess over the base limit")
        void displayCount_excess() {
            UserLicenseSettings s = new UserLicenseSettings();
            s.setIntegritySalt("salt");
            s.setGrandfatheredUserCount(15);
            when(settingsRepository.findSettings()).thenReturn(Optional.of(s));

            int display = service.getDisplayGrandfatheredCount();

            assertThat(display).isEqualTo(10);
        }

        @Test
        @DisplayName("display count is zero when at the base limit")
        void displayCount_zeroAtBase() {
            UserLicenseSettings s = new UserLicenseSettings();
            s.setIntegritySalt("salt");
            s.setGrandfatheredUserCount(5);
            when(settingsRepository.findSettings()).thenReturn(Optional.of(s));

            int display = service.getDisplayGrandfatheredCount();

            assertThat(display).isZero();
        }

        @Test
        @DisplayName("getSettings delegates to getOrCreateSettings")
        void getSettings_delegates() {
            UserLicenseSettings s = new UserLicenseSettings();
            s.setIntegritySalt("salt");
            s.setGrandfatheredUserCount(7);
            when(settingsRepository.findSettings()).thenReturn(Optional.of(s));

            UserLicenseSettings result = service.getSettings();

            assertThat(result.getGrandfatheredUserCount()).isEqualTo(7);
        }
    }

    @Nested
    @DisplayName("grandfatherExistingOAuthUsers - new-server guard")
    class GrandfatherNewServerGuard {

        @Test
        @DisplayName("fresh V2 install skips OAuth grandfathering")
        void freshV2_skips() {
            applicationProperties.getAutomaticallyGenerated().setIsNewServer(true);

            service.grandfatherExistingOAuthUsers();

            verify(userService, never()).grandfatherAllOAuthUsers();
            verify(userService, never()).grandfatherPendingSsoUsersWithoutSession();
        }

        @Test
        @DisplayName("upgrade install runs OAuth grandfathering when none grandfathered yet")
        void upgrade_runsGrandfathering() {
            applicationProperties.getAutomaticallyGenerated().setIsNewServer(false);
            UserLicenseSettings s = new UserLicenseSettings();
            s.setId(UserLicenseSettings.SINGLETON_ID);
            s.setIntegritySalt("salt");
            s.setGrandfatheringLocked(true);
            when(settingsRepository.findSettings()).thenReturn(Optional.of(s));
            when(userService.countOAuthUsers()).thenReturn(6L);
            when(userService.countGrandfatheredOAuthUsers()).thenReturn(0L);
            when(userService.grandfatherAllOAuthUsers()).thenReturn(6);
            when(userService.grandfatherPendingSsoUsersWithoutSession()).thenReturn(1);

            service.grandfatherExistingOAuthUsers();

            verify(userService, times(1)).grandfatherAllOAuthUsers();
            verify(userService, times(1)).grandfatherPendingSsoUsersWithoutSession();
        }
    }
}
