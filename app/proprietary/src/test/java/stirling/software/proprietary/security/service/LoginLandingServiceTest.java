package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.LoginLandingView;
import stirling.software.proprietary.security.model.User;

@ExtendWith(MockitoExtension.class)
class LoginLandingServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private DatabaseServiceInterface databaseService;

    @InjectMocks private LoginLandingService loginLandingService;

    private static User user(String storedValue) {
        User user = new User();
        user.setId(7L);
        user.setUsername("someone@example.com");
        if (storedValue != null) {
            user.getSettings().put(LoginLandingService.LOGIN_LANDING_VIEW_KEY, storedValue);
        }
        return user;
    }

    @Test
    void defaultsToEditorWhenUnset() {
        when(userRepository.findByIdWithSettings(7L)).thenReturn(Optional.of(user(null)));

        assertEquals(LoginLandingView.EDITOR, loginLandingService.getLandingView(user(null)));
    }

    @Test
    void returnsProcessorWhenOptedIn() {
        when(userRepository.findByIdWithSettings(7L)).thenReturn(Optional.of(user("processor")));

        assertEquals(LoginLandingView.PROCESSOR, loginLandingService.getLandingView(user(null)));
    }

    @Test
    void setLandingViewStoresTheWireValueAndExports() throws Exception {
        User stored = user(null);
        when(userRepository.findByUsernameIgnoreCaseWithSettings("someone@example.com"))
                .thenReturn(Optional.of(stored));

        loginLandingService.setLandingView("someone@example.com", LoginLandingView.PROCESSOR);

        assertEquals(
                "processor", stored.getSettings().get(LoginLandingService.LOGIN_LANDING_VIEW_KEY));
        verify(userRepository).save(stored);
        verify(databaseService).exportDatabase();
    }
}
