package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
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

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserLicenseSettingsServiceTest {

    @Mock private UserLicenseSettingsRepository settingsRepository;
    @Mock private UserService userService;
    @Mock private ApplicationProperties applicationProperties;
    @Mock private ApplicationProperties.Premium premium;
    @Mock private LicenseKeyChecker licenseKeyChecker;
    @Mock private ObjectProvider<LicenseKeyChecker> licenseKeyCheckerProvider;

    private UserLicenseSettingsService service;
    private UserLicenseSettings mockSettings;

    @BeforeEach
    void setUp() {
        mockSettings = new UserLicenseSettings();
        mockSettings.setId(1L);
        mockSettings.setGrandfatheredUserCount(80);
        mockSettings.setGrandfatheringLocked(true);
        mockSettings.setIntegritySalt("test-salt");
        mockSettings.setGrandfatheredUserSignature("80:test-signature");

        when(applicationProperties.getPremium()).thenReturn(premium);
        when(settingsRepository.findSettings()).thenReturn(Optional.of(mockSettings));
        when(userService.getTotalUsersCount()).thenReturn(80L);
        when(settingsRepository.save(any(UserLicenseSettings.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);
        when(licenseKeyCheckerProvider.getIfAvailable()).thenReturn(licenseKeyChecker);

        // Create service with overridden validateSettingsIntegrity to bypass signature validation
        service =
                new UserLicenseSettingsService(
                        settingsRepository,
                        userService,
                        applicationProperties,
                        licenseKeyCheckerProvider) {
                    @Override
                    public void validateSettingsIntegrity() {
                        // Override to do nothing in tests - avoid HMAC signature validation
                        // complexity
                    }
                };
    }

    @Test
    void noLicense_returnsGrandfatheredLimit() {
        // No license active
        when(premium.isEnabled()).thenReturn(false);
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

        int result = service.calculateMaxAllowedUsers();

        assertEquals(80, result, "Should return grandfathered user count when no license");
    }

    @Test
    void serverLicense_returnsUnlimited() {
        // SERVER license with users=0
        when(premium.isEnabled()).thenReturn(true);
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);
        mockSettings.setLicenseMaxUsers(0);

        int result = service.calculateMaxAllowedUsers();

        assertEquals(Integer.MAX_VALUE, result, "SERVER license should return unlimited users");
    }

    @Test
    void enterpriseLicense_returnsLicenseSeatsOnly() {
        // ENTERPRISE license with 5 seats
        when(premium.isEnabled()).thenReturn(true);
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);
        mockSettings.setLicenseMaxUsers(5);

        int result = service.calculateMaxAllowedUsers();

        assertEquals(
                5,
                result,
                "ENTERPRISE license should return license seats only (NOT grandfathered + seats)");
    }

    @Test
    void enterpriseLicense_ignoresGrandfathering() {
        // ENTERPRISE with 20 seats, grandfathered was 80
        when(premium.isEnabled()).thenReturn(true);
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);
        mockSettings.setLicenseMaxUsers(20);
        mockSettings.setGrandfatheredUserCount(80); // This should be ignored

        int result = service.calculateMaxAllowedUsers();

        assertEquals(
                20,
                result,
                "ENTERPRISE license should ignore grandfathering and use license seats only");
    }

    @Test
    void freshInstall_noLicense_returnsFive() {
        // Fresh install with default 5 users grandfathered
        mockSettings.setGrandfatheredUserCount(5);
        when(premium.isEnabled()).thenReturn(false);

        int result = service.calculateMaxAllowedUsers();

        assertEquals(5, result, "Fresh install with no license should return 5 users");
    }

    @Test
    void freshInstall_serverLicense_returnsUnlimited() {
        // Fresh install with SERVER license
        mockSettings.setGrandfatheredUserCount(5);
        when(premium.isEnabled()).thenReturn(true);
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);
        mockSettings.setLicenseMaxUsers(0);

        int result = service.calculateMaxAllowedUsers();

        assertEquals(
                Integer.MAX_VALUE,
                result,
                "Fresh install with SERVER license should return unlimited");
    }

    @Test
    void freshInstall_enterpriseLicense_returnsLicenseSeats() {
        // Fresh install with ENTERPRISE 10 seats
        mockSettings.setGrandfatheredUserCount(5);
        when(premium.isEnabled()).thenReturn(true);
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);
        mockSettings.setLicenseMaxUsers(10);

        int result = service.calculateMaxAllowedUsers();

        assertEquals(
                10, result, "Fresh install with ENTERPRISE license should return license seats");
    }

    @Test
    void v1MigrationWith80Users_noLicense_returns80() {
        // V1→V2 migration with 80 users, no paid license
        mockSettings.setGrandfatheredUserCount(80);
        when(premium.isEnabled()).thenReturn(false);

        int result = service.calculateMaxAllowedUsers();

        assertEquals(80, result, "V1→V2 migration should preserve 80 grandfathered users");
    }

    @Test
    void v1MigrationWith80Users_thenEnterpriseWith5Seats_returns5() {
        // V1→V2 with 80 users, then buy ENTERPRISE 5 seats
        mockSettings.setGrandfatheredUserCount(80);
        when(premium.isEnabled()).thenReturn(true);
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);
        mockSettings.setLicenseMaxUsers(5);

        int result = service.calculateMaxAllowedUsers();

        assertEquals(
                5, result, "ENTERPRISE 5 seats should override grandfathered 80 users (not 85)");
    }

    @Test
    void zeroGrandfathered_fallsBackToDefault() {
        // Edge case: grandfathered is 0 (should not happen)
        mockSettings.setGrandfatheredUserCount(0);
        when(premium.isEnabled()).thenReturn(false);

        int result = service.calculateMaxAllowedUsers();

        assertEquals(5, result, "Should fall back to default 5 users if grandfathered is 0");
    }

    @Test
    void grandfatherExistingOAuthUsers_runsWhenSomeUsersNotGrandfathered() {
        when(userService.countOAuthUsers()).thenReturn(10L);
        when(userService.countGrandfatheredOAuthUsers()).thenReturn(4L);
        when(userService.grandfatherAllOAuthUsers()).thenReturn(6);

        service.grandfatherExistingOAuthUsers();

        verify(userService, times(1)).grandfatherAllOAuthUsers();
    }

    @Test
    void grandfatherExistingOAuthUsers_skipsWhenAllUsersGrandfathered() {
        when(userService.countOAuthUsers()).thenReturn(10L);
        when(userService.countGrandfatheredOAuthUsers()).thenReturn(10L);

        service.grandfatherExistingOAuthUsers();

        verify(userService, never()).grandfatherAllOAuthUsers();
    }

    @Test
    void grandfatherExistingOAuthUsers_skipsWhenNoOAuthUsers() {
        when(userService.countOAuthUsers()).thenReturn(0L);
        when(userService.countGrandfatheredOAuthUsers()).thenReturn(0L);

        service.grandfatherExistingOAuthUsers();

        verify(userService, never()).grandfatherAllOAuthUsers();
    }

    @Test
    void grandfatherExistingOAuthUsers_handlesPendingUsersWithoutSessions() {
        when(userService.countOAuthUsers()).thenReturn(5L);
        when(userService.countGrandfatheredOAuthUsers()).thenReturn(5L);
        when(userService.grandfatherPendingSsoUsersWithoutSession()).thenReturn(3);

        service.grandfatherExistingOAuthUsers();

        verify(userService, never()).grandfatherAllOAuthUsers();
        verify(userService, times(1)).grandfatherPendingSsoUsersWithoutSession();
    }

    @Test
    void grandfatherExistingOAuthUsers_checksPendingUsersEvenWhenNoneExist() {
        when(userService.countOAuthUsers()).thenReturn(0L);
        when(userService.countGrandfatheredOAuthUsers()).thenReturn(0L);
        when(userService.grandfatherPendingSsoUsersWithoutSession()).thenReturn(0);

        service.grandfatherExistingOAuthUsers();

        verify(userService, times(1)).grandfatherPendingSsoUsersWithoutSession();
    }
}
