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
    @Mock private ApplicationProperties.AutomaticallyGenerated automaticallyGenerated;
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
        when(applicationProperties.getAutomaticallyGenerated()).thenReturn(automaticallyGenerated);
        when(automaticallyGenerated.getIsNewServer())
                .thenReturn(false); // Default: not a new server
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
    void serverLicense_returnsUnlimited() {
        // SERVER license with users=0
        when(premium.isEnabled()).thenReturn(true);
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);
        mockSettings.setLicenseMaxUsers(0);

        int result = service.calculateMaxAllowedUsers();

        assertEquals(Integer.MAX_VALUE, result, "SERVER license should return unlimited users");
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
    void grandfatherExistingOAuthUsers_runsOnlyWhenNoneGrandfathered() {
        // With grandfatheredCount == 0, should run grandfathering for all users
        when(userService.countOAuthUsers()).thenReturn(10L);
        when(userService.countGrandfatheredOAuthUsers()).thenReturn(0L);
        when(userService.grandfatherAllOAuthUsers()).thenReturn(10);
        when(userService.grandfatherPendingSsoUsersWithoutSession()).thenReturn(0);

        service.grandfatherExistingOAuthUsers();

        verify(userService, times(1)).grandfatherAllOAuthUsers();
        verify(userService, times(1)).grandfatherPendingSsoUsersWithoutSession();
    }

    @Test
    void grandfatherExistingOAuthUsers_skipsMainButRunsPendingWhenSomeAlreadyGrandfathered() {
        // V2→V2.1 upgrade: some users already grandfathered, but pending users need to be checked
        when(userService.countOAuthUsers()).thenReturn(10L);
        when(userService.countGrandfatheredOAuthUsers()).thenReturn(4L);
        when(userService.grandfatherPendingSsoUsersWithoutSession()).thenReturn(2);

        service.grandfatherExistingOAuthUsers();

        verify(userService, never()).grandfatherAllOAuthUsers();
        verify(userService, times(1)).grandfatherPendingSsoUsersWithoutSession();
    }

    @Test
    void grandfatherExistingOAuthUsers_stillChecksPendingWhenAllUsersGrandfathered() {
        // All active users grandfathered, but still check for pending users
        when(userService.countOAuthUsers()).thenReturn(10L);
        when(userService.countGrandfatheredOAuthUsers()).thenReturn(10L);
        when(userService.grandfatherPendingSsoUsersWithoutSession()).thenReturn(0);

        service.grandfatherExistingOAuthUsers();

        verify(userService, never()).grandfatherAllOAuthUsers();
        verify(userService, times(1)).grandfatherPendingSsoUsersWithoutSession();
    }

    @Test
    void grandfatherExistingOAuthUsers_skipsWhenNoOAuthUsers() {
        when(userService.countOAuthUsers()).thenReturn(0L);
        when(userService.countGrandfatheredOAuthUsers()).thenReturn(0L);

        service.grandfatherExistingOAuthUsers();

        verify(userService, never()).grandfatherAllOAuthUsers();
        verify(userService, never()).grandfatherPendingSsoUsersWithoutSession();
    }

    @Test
    void grandfatherExistingOAuthUsers_grandfathersPendingUsersOnFirstRun() {
        // Pending users (invited but never logged in) should be grandfathered
        // during the initial grandfathering run (when grandfatheredCount == 0)
        when(userService.countOAuthUsers()).thenReturn(5L);
        when(userService.countGrandfatheredOAuthUsers()).thenReturn(0L);
        when(userService.grandfatherAllOAuthUsers()).thenReturn(5);
        when(userService.grandfatherPendingSsoUsersWithoutSession()).thenReturn(3);

        service.grandfatherExistingOAuthUsers();

        verify(userService, times(1)).grandfatherAllOAuthUsers();
        verify(userService, times(1)).grandfatherPendingSsoUsersWithoutSession();
    }

    // ===== OAuth Eligibility Tests =====

    @Test
    void isOAuthEligible_grandfatheredUser_returnsTrue() {
        // Grandfathered user should be eligible regardless of license
        stirling.software.proprietary.security.model.User user =
                new stirling.software.proprietary.security.model.User();
        user.setUsername("grandfathered-user");
        user.setOauthGrandfathered(true);

        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

        boolean result = service.isOAuthEligible(user);

        assertEquals(true, result, "Grandfathered user should be eligible for OAuth");
    }

    @Test
    void isOAuthEligible_nonGrandfatheredUserWithServerLicense_returnsTrue() {
        // Non-grandfathered user with SERVER license should be eligible
        stirling.software.proprietary.security.model.User user =
                new stirling.software.proprietary.security.model.User();
        user.setUsername("test-user");
        user.setOauthGrandfathered(false);

        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

        boolean result = service.isOAuthEligible(user);

        assertEquals(true, result, "Non-grandfathered user with SERVER license should be eligible");
    }

    @Test
    void isOAuthEligible_nonGrandfatheredUserWithEnterpriseLicense_returnsTrue() {
        // Non-grandfathered user with ENTERPRISE license should be eligible
        stirling.software.proprietary.security.model.User user =
                new stirling.software.proprietary.security.model.User();
        user.setUsername("test-user");
        user.setOauthGrandfathered(false);

        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

        boolean result = service.isOAuthEligible(user);

        assertEquals(
                true, result, "Non-grandfathered user with ENTERPRISE license should be eligible");
    }

    @Test
    void isOAuthEligible_newUserWithServerLicense_returnsTrue() {
        // New user (null) with SERVER license should be eligible for auto-creation
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

        boolean result = service.isOAuthEligible(null);

        assertEquals(
                true, result, "New user with SERVER license should be eligible for auto-creation");
    }

    // ===== SAML Eligibility Tests =====

    @Test
    void isSamlEligible_grandfatheredUser_returnsTrue() {
        // Grandfathered user should be eligible for SAML regardless of license
        stirling.software.proprietary.security.model.User user =
                new stirling.software.proprietary.security.model.User();
        user.setUsername("grandfathered-user");
        user.setOauthGrandfathered(true);

        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

        boolean result = service.isSamlEligible(user);

        assertEquals(true, result, "Grandfathered user should be eligible for SAML");
    }

    @Test
    void isSamlEligible_nonGrandfatheredUserWithEnterpriseLicense_returnsTrue() {
        // Non-grandfathered user with ENTERPRISE license should be eligible
        stirling.software.proprietary.security.model.User user =
                new stirling.software.proprietary.security.model.User();
        user.setUsername("test-user");
        user.setOauthGrandfathered(false);

        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

        boolean result = service.isSamlEligible(user);

        assertEquals(
                true,
                result,
                "Non-grandfathered user with ENTERPRISE license should be eligible for SAML");
    }

    @Test
    void isSamlEligible_newUserWithEnterpriseLicense_returnsTrue() {
        // New user (null) with ENTERPRISE license should be eligible for auto-creation
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

        boolean result = service.isSamlEligible(null);

        assertEquals(
                true,
                result,
                "New user with ENTERPRISE license should be eligible for SAML auto-creation");
    }
}
