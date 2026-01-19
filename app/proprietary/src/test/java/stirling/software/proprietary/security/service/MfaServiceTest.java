package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

@ExtendWith(MockitoExtension.class)
class MfaServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private DatabaseServiceInterface databaseService;

    @InjectMocks private MfaService mfaService;

    @Test
    void setSecretStoresSecretAndDisablesMfa() throws Exception {
        User user = new User();
        user.getSettings().put(MfaService.MFA_LAST_USED_STEP_KEY, "10");
        when(userRepository.save(any(User.class))).thenAnswer(i -> i.getArgument(0));

        mfaService.setSecret(user, "NEWSECRET");

        assertEquals("NEWSECRET", user.getSettings().get(MfaService.MFA_SECRET_KEY));
        assertEquals("false", user.getSettings().get(MfaService.MFA_ENABLED_KEY));
        assertNull(user.getSettings().get(MfaService.MFA_LAST_USED_STEP_KEY));
        verify(databaseService).exportDatabase();
    }

    @Test
    void enableMfaSetsEnabledFlag() throws Exception {
        User user = new User();
        when(userRepository.save(any(User.class))).thenAnswer(i -> i.getArgument(0));

        mfaService.enableMfa(user);

        assertEquals("true", user.getSettings().get(MfaService.MFA_ENABLED_KEY));
        verify(databaseService).exportDatabase();
    }

    @Test
    void disableMfaClearsSecretAndUsage() throws Exception {
        User user = new User();
        user.getSettings().put(MfaService.MFA_SECRET_KEY, "SECRET");
        user.getSettings().put(MfaService.MFA_LAST_USED_STEP_KEY, "20");
        when(userRepository.save(any(User.class))).thenAnswer(i -> i.getArgument(0));

        mfaService.disableMfa(user);

        assertEquals("false", user.getSettings().get(MfaService.MFA_ENABLED_KEY));
        assertNull(user.getSettings().get(MfaService.MFA_SECRET_KEY));
        assertNull(user.getSettings().get(MfaService.MFA_LAST_USED_STEP_KEY));
        verify(databaseService).exportDatabase();
    }

    @Test
    void markTotpStepUsedTracksNewestStep() throws Exception {
        User user = new User();
        when(userRepository.save(any(User.class))).thenAnswer(i -> i.getArgument(0));

        assertTrue(mfaService.markTotpStepUsed(user, 100L));
        assertEquals("100", user.getSettings().get(MfaService.MFA_LAST_USED_STEP_KEY));
        verify(databaseService).exportDatabase();
    }

    @Test
    void markTotpStepUsedRejectsReplays() throws Exception {
        User user = new User();
        user.getSettings().put(MfaService.MFA_LAST_USED_STEP_KEY, "200");

        assertFalse(mfaService.markTotpStepUsed(user, 199L));
        assertFalse(mfaService.markTotpStepUsed(user, 200L));
        verify(databaseService, never()).exportDatabase();
    }

    @Test
    void markTotpStepUsedIgnoresMalformedStoredValue() throws Exception {
        User user = new User();
        user.getSettings().put(MfaService.MFA_LAST_USED_STEP_KEY, "not-a-number");
        when(userRepository.save(any(User.class))).thenAnswer(i -> i.getArgument(0));

        assertTrue(mfaService.markTotpStepUsed(user, 5L));
        assertEquals("5", user.getSettings().get(MfaService.MFA_LAST_USED_STEP_KEY));
        verify(databaseService, times(1)).exportDatabase();
    }

    @Test
    void isTotpStepUsableRespectsLastStep() {
        User user = new User();
        user.getSettings().put(MfaService.MFA_LAST_USED_STEP_KEY, "50");

        assertFalse(mfaService.isTotpStepUsable(user, 50));
        assertFalse(mfaService.isTotpStepUsable(user, 40));
        assertTrue(mfaService.isTotpStepUsable(user, 51));
    }

    @Test
    void isMfaRequiredDefaultsToFalse() {
        User user = new User();

        assertFalse(mfaService.isMfaRequired(user));
    }

    @Test
    void setMfaRequiredStoresFlag() throws Exception {
        User user = new User();
        when(userRepository.save(any(User.class))).thenAnswer(i -> i.getArgument(0));

        mfaService.setMfaRequired(user, true);

        assertEquals("true", user.getSettings().get(MfaService.MFA_REQUIRED_KEY));
        verify(databaseService).exportDatabase();
    }
}
