package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;

@ExtendWith(MockitoExtension.class)
class CustomUserDetailsServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private LoginAttemptService loginAttemptService;

    private ApplicationProperties.Security security;
    private CustomUserDetailsService service;

    @BeforeEach
    void setUp() {
        security = new ApplicationProperties.Security();
        service = new CustomUserDetailsService(userRepository, loginAttemptService, security);
    }

    private User legacyUser(String password) {
        User user = new User();
        user.setUsername("legacy");
        user.setPassword(password);
        when(userRepository.findByUsername("legacy")).thenReturn(Optional.of(user));
        return user;
    }

    @Test
    void legacyUserWithPasswordIsBackFilledAsWebAndSaved() {
        User user = legacyUser("hash");

        service.loadUserByUsername("legacy");

        assertThat(user.getAuthenticationType()).isEqualTo("web");
        verify(userRepository).save(user);
    }

    @Test
    void legacyUserWithoutPasswordIsBackFilledAsSso() {
        User user = legacyUser(null);

        service.loadUserByUsername("legacy");

        assertThat(user.getAuthenticationType()).isEqualTo("oauth2");
        verify(userRepository).save(user);
    }

    @Test
    void userWithStoredTypeIsNotWritten() {
        User user = new User();
        user.setUsername("current");
        user.setPassword("hash");
        user.setAuthenticationType(AuthenticationType.WEB);
        when(userRepository.findByUsername("current")).thenReturn(Optional.of(user));

        service.loadUserByUsername("current");

        verify(userRepository, never()).save(any());
    }
}
