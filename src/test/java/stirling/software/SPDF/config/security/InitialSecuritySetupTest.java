package stirling.software.SPDF.config.security;

import java.io.IOException;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import stirling.software.SPDF.config.security.database.DatabaseService;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.User;
import static org.mockito.Mockito.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class InitialSecuritySetupTest {

    @Mock
    private UserService userService;

    @Mock
    private ApplicationProperties applicationProperties;

    @Mock
    private DatabaseService databaseService;

    @InjectMocks
    private InitialSecuritySetup initialSecuritySetup;

    @Test
    void testInit() throws IOException {
        String username = "admin";
        String password = "stirling";
        ApplicationProperties.Security security = mock(ApplicationProperties.Security.class);
        ApplicationProperties.Security.InitialLogin initialLogin = mock(ApplicationProperties.Security.InitialLogin.class);
        Optional<User> user = Optional.of(mock(User.class));

        when(userService.hasUsers()).thenReturn(false);
        when(applicationProperties.getSecurity()).thenReturn(security);
        when(security.getInitialLogin()).thenReturn(initialLogin);
        when(initialLogin.getUsername()).thenReturn(username);
        when(initialLogin.getPassword()).thenReturn(password);
        when(userService.findByUsernameIgnoreCase(username)).thenReturn(user);
        when(userService.usernameExistsIgnoreCase(anyString())).thenReturn(false);

        initialSecuritySetup.init();

        verify(userService).saveUser(anyString(), anyString(), anyString());
        verify(userService).migrateOauth2ToSSO();
        verify(userService).addApiKeyToUser(anyString());
    }

}