package stirling.software.SPDF.config.security;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import stirling.software.SPDF.config.security.database.DatabaseService;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.User;

import java.io.IOException;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

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
        ApplicationProperties.System system = mock(ApplicationProperties.System.class);
        ApplicationProperties.Security security = mock(ApplicationProperties.Security.class);
        ApplicationProperties.Security.InitialLogin initialLogin = mock(ApplicationProperties.Security.InitialLogin.class);
        Optional<User> user = Optional.of(mock(User.class));

        when(applicationProperties.getSystem()).thenReturn(system);
        when(system.getSpringProfilesActive()).thenReturn("postgres");
        doNothing().when(databaseService).setAdminUser();
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