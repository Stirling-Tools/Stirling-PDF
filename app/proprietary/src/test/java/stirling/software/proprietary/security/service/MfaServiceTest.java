package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

@ExtendWith(MockitoExtension.class)
class MfaServiceTest {

    @Mock private UserRepository userRepository;

    @Mock private DatabaseServiceInterface databaseService;

    private MfaService mfaService;

    @BeforeEach
    void setUp() {
        mfaService = new MfaService(userRepository, databaseService);
    }

    @Test
    void setSecretStoresSecretAndDisablesMfa() throws Exception {
        User user = new User();
        user.getSettings().put(MfaService.MFA_LAST_USED_STEP_KEY, "10");

        mfaService.setSecret(user, "NEWSECRET");

        assertEquals("NEWSECRET", user.getSettings().get(MfaService.MFA_SECRET_KEY));
        assertEquals("false", user.getSettings().get(MfaService.MFA_ENABLED_KEY));
        assertNull(user.getSettings().get(MfaService.MFA_LAST_USED_STEP_KEY));
        verify(userRepository).save(user);
        verify(databaseService).exportDatabase();
    }

    @Test
    void enableMfaSetsEnabledFlag() throws Exception {
        User user = new User();

        mfaService.enableMfa(user);

        assertEquals("true", user.getSettings().get(MfaService.MFA_ENABLED_KEY));
        verify(userRepository).save(user);
        verify(databaseService).exportDatabase();
    }

    @Test
    void disableMfaClearsSecretAndUsage() throws Exception {
        User user = new User();
        user.getSettings().put(MfaService.MFA_SECRET_KEY, "SECRET");
        user.getSettings().put(MfaService.MFA_LAST_USED_STEP_KEY, "20");

        mfaService.disableMfa(user);

        assertEquals("false", user.getSettings().get(MfaService.MFA_ENABLED_KEY));
        assertNull(user.getSettings().get(MfaService.MFA_SECRET_KEY));
        assertNull(user.getSettings().get(MfaService.MFA_LAST_USED_STEP_KEY));
        verify(userRepository).save(user);
        verify(databaseService).exportDatabase();
    }

    @Test
    void markTotpStepUsedTracksNewestStep() throws Exception {
        User user = new User();

        assertTrue(mfaService.markTotpStepUsed(user, 100L));
        assertEquals("100", user.getSettings().get(MfaService.MFA_LAST_USED_STEP_KEY));
        verify(userRepository).save(user);
        verify(databaseService).exportDatabase();
    }

    @Test
    void markTotpStepUsedRejectsReplays() throws Exception {
        User user = new User();
        user.getSettings().put(MfaService.MFA_LAST_USED_STEP_KEY, "200");

        assertFalse(mfaService.markTotpStepUsed(user, 199L));
        assertFalse(mfaService.markTotpStepUsed(user, 200L));
        verify(userRepository, never()).save(user);
        verify(databaseService, never()).exportDatabase();
    }

    @Test
    void markTotpStepUsedIgnoresMalformedStoredValue() throws Exception {
        User user = new User();
        user.getSettings().put(MfaService.MFA_LAST_USED_STEP_KEY, "not-a-number");

        assertTrue(mfaService.markTotpStepUsed(user, 5L));
        assertEquals("5", user.getSettings().get(MfaService.MFA_LAST_USED_STEP_KEY));
        verify(userRepository, times(1)).save(user);
        verify(databaseService, times(1)).exportDatabase();
    }

    @Test
    void isMfaRequiredDefaultsToFalse() {
        User user = new User();

        assertFalse(mfaService.isMfaRequired(user));
    }

    @Test
    void setMfaRequiredStoresFlag() throws Exception {
        User user = new User();

        mfaService.setMfaRequired(user, true);

        assertEquals("true", user.getSettings().get(MfaService.MFA_REQUIRED_KEY));
        verify(userRepository).save(user);
        verify(databaseService).exportDatabase();
    }
}
