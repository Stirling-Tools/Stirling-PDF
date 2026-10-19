package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.RETURNS_DEFAULTS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.Optional;

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

    @Mock private LoginAttemptService loginAttemptService;

    private UserRepository userRepository;

    /**
     * Answers every {@code findByUsername*} lookup with {@code user}, so these tests pin the
     * back-fill rather than which repository method resolves the user.
     */
    private CustomUserDetailsService serviceFor(User user) {
        userRepository =
                mock(
                        UserRepository.class,
                        invocation ->
                                invocation.getMethod().getName().startsWith("findByUsername")
                                                && invocation.getMethod().getReturnType()
                                                        == Optional.class
                                        ? Optional.of(user)
                                        : RETURNS_DEFAULTS.answer(invocation));
        return new CustomUserDetailsService(
                userRepository, loginAttemptService, new ApplicationProperties.Security());
    }

    private User legacyUser(String password) {
        User user = new User();
        user.setUsername("legacy");
        user.setPassword(password);
        return user;
    }

    @Test
    void legacyUserWithPasswordIsBackFilledAsWebAndSaved() {
        User user = legacyUser("hash");

        serviceFor(user).loadUserByUsername("legacy");

        assertThat(user.getAuthenticationType()).isEqualTo("web");
        verify(userRepository).save(user);
    }

    @Test
    void legacyUserWithoutPasswordIsBackFilledAsSso() {
        User user = legacyUser(null);

        serviceFor(user).loadUserByUsername("legacy");

        assertThat(user.getAuthenticationType()).isEqualTo("oauth2");
        verify(userRepository).save(user);
    }

    @Test
    void userWithStoredTypeIsNotWritten() {
        User user = new User();
        user.setUsername("current");
        user.setPassword("hash");
        user.setAuthenticationType(AuthenticationType.WEB);

        serviceFor(user).loadUserByUsername("current");

        verify(userRepository, never()).save(any());
    }
}
