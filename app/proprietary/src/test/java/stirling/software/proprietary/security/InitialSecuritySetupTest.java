package stirling.software.proprietary.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.SQLException;
import java.util.Collections;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.DatabaseServiceInterface;
import stirling.software.proprietary.security.service.SaveUserRequest;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

@ExtendWith(MockitoExtension.class)
class InitialSecuritySetupTest {

    @Mock private UserService userService;
    @Mock private TeamService teamService;
    @Mock private DatabaseServiceInterface databaseService;
    @Mock private UserLicenseSettingsService licenseSettingsService;

    private ApplicationProperties applicationProperties;
    private InitialSecuritySetup initialSecuritySetup;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        applicationProperties.getSecurity().getInitialLogin().setUsername("admin");
        applicationProperties.getSecurity().getInitialLogin().setPassword("password");
        Team internalTeam = new Team();
        internalTeam.setName(TeamService.INTERNAL_TEAM_NAME);
        User internalUser = new User();
        internalUser.setUsername(Role.INTERNAL_API_USER.getRoleId());
        internalUser.setTeam(internalTeam);
        when(userService.findByUsernameIgnoreCase(Role.INTERNAL_API_USER.getRoleId()))
                .thenReturn(Optional.of(internalUser));
        when(teamService.getOrCreateInternalTeam()).thenReturn(internalTeam);
        initialSecuritySetup =
                new InitialSecuritySetup(
                        userService,
                        teamService,
                        applicationProperties,
                        databaseService,
                        licenseSettingsService);
    }

    @Test
    void initImportsBackupWhenPresent() throws SQLException, UnsupportedProviderException {
        when(userService.hasUsers()).thenReturn(false);
        when(databaseService.hasBackup()).thenReturn(true);
        when(userService.getUsersWithoutTeam()).thenReturn(Collections.emptyList());
        when(userService.usernameExistsIgnoreCase(Role.INTERNAL_API_USER.getRoleId()))
                .thenReturn(true);

        initialSecuritySetup.init();

        verify(databaseService).importDatabase();
        verify(userService, never()).saveUserCore(any());
        verify(licenseSettingsService).initializeGrandfatheredCount();
        verify(licenseSettingsService).updateLicenseMaxUsers();
    }

    @Test
    void initCreatesConfiguredAdminWhenNoBackup()
            throws SQLException, UnsupportedProviderException {
        when(userService.hasUsers()).thenReturn(false);
        when(databaseService.hasBackup()).thenReturn(false);
        when(userService.findByUsernameIgnoreCase("admin")).thenReturn(Optional.empty());
        Team defaultTeam = new Team();
        defaultTeam.setName(TeamService.DEFAULT_TEAM_NAME);
        when(teamService.getOrCreateDefaultTeam()).thenReturn(defaultTeam);
        when(userService.getUsersWithoutTeam()).thenReturn(Collections.emptyList());
        when(userService.usernameExistsIgnoreCase(Role.INTERNAL_API_USER.getRoleId()))
                .thenReturn(true);

        initialSecuritySetup.init();

        ArgumentCaptor<SaveUserRequest> captor = ArgumentCaptor.forClass(SaveUserRequest.class);
        verify(userService).saveUserCore(captor.capture());
        SaveUserRequest saved = captor.getValue();
        assertThat(saved.getUsername()).isEqualTo("admin");
        assertThat(saved.getPassword()).isEqualTo("password");
    }

    @Test
    void configureJwtSettingsDisablesKeyCleanupWhenJwtDisabled() {
        ReflectionTestUtils.setField(initialSecuritySetup, "v2Enabled", true);
        applicationProperties.getSecurity().getJwt().setEnableKeystore(false);
        when(userService.hasUsers()).thenReturn(true);
        when(userService.getUsersWithoutTeam()).thenReturn(Collections.emptyList());
        when(userService.usernameExistsIgnoreCase(any())).thenReturn(true);

        initialSecuritySetup.init();

        assertThat(applicationProperties.getSecurity().getJwt().isEnableKeyCleanup()).isFalse();
    }
}
