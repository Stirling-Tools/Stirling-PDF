package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

import java.sql.SQLException;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.MessageSource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.AuthorityRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private TeamRepository teamRepository;
    @Mock private AuthorityRepository authorityRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private MessageSource messageSource;
    @Mock private SessionPersistentRegistry sessionRegistry;
    @Mock private DatabaseServiceInterface databaseService;
    @Mock private ApplicationProperties.Security.OAUTH2 oAuth2;

    @Spy @InjectMocks private UserService userService;

    @Test
    void saveUserCore_populatesFieldsAndPersists()
            throws SQLException, UnsupportedProviderException {
        Long teamId = 42L;
        Team team = new Team();
        team.setId(teamId);
        when(teamRepository.findById(teamId)).thenReturn(Optional.of(team));
        when(passwordEncoder.encode("plain")).thenReturn("encoded");
        when(userRepository.save(any(User.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        SaveUserRequest request =
                SaveUserRequest.builder()
                        .username("validUser")
                        .password("plain")
                        .ssoProviderId("sso-id")
                        .ssoProvider("provider-x")
                        .authenticationType(AuthenticationType.OAUTH2)
                        .teamId(teamId)
                        .role(Role.ADMIN.getRoleId())
                        .firstLogin(true)
                        .enabled(false)
                        .requireMfa(true)
                        .mfaEnabled(true)
                        .mfaSecret("top-secret")
                        .mfaLastUsedStep(5L)
                        .build();

        User saved = userService.saveUserCore(request);

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(userCaptor.capture());
        verify(databaseService).exportDatabase();

        User persisted = userCaptor.getValue();
        assertEquals("validUser", persisted.getUsername());
        assertEquals("encoded", persisted.getPassword());
        assertEquals("provider-x", persisted.getSsoProvider());
        assertEquals("sso-id", persisted.getSsoProviderId());
        assertEquals(team, persisted.getTeam());
        assertEquals("oauth2", persisted.getAuthenticationType());
        assertFalse(persisted.isEnabled());
        assertTrue(persisted.isFirstLogin());
        assertTrue(
                persisted.getAuthorities().stream()
                        .anyMatch(a -> Role.ADMIN.getRoleId().equals(a.getAuthority())));
        assertEquals(
                "true",
                persisted.getSettings().get(MfaService.MFA_REQUIRED_KEY),
                "MFA requirement should be stored");
        assertEquals(
                "true",
                persisted.getSettings().get(MfaService.MFA_ENABLED_KEY),
                "MFA enabled flag should be stored");
        assertEquals(
                "top-secret",
                persisted.getSettings().get(MfaService.MFA_SECRET_KEY),
                "MFA secret should be stored");
        assertEquals(
                "5",
                persisted.getSettings().get(MfaService.MFA_LAST_USED_STEP_KEY),
                "MFA last used step should be stored");
        assertSame(saved, persisted, "Returned user should be the persisted instance");
    }

    @Test
    void saveUserCore_withoutTeam_usesDefaultTeam()
            throws SQLException, UnsupportedProviderException {
        Team defaultTeam = new Team();
        defaultTeam.setName("Default");
        when(teamRepository.findByName("Default")).thenReturn(Optional.of(defaultTeam));
        when(userRepository.save(any(User.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        SaveUserRequest request = SaveUserRequest.builder().username("anotherUser").build();

        User saved = userService.saveUserCore(request);

        verify(teamRepository).findByName("Default");
        verify(teamRepository, never()).findById(anyLong());
        verify(databaseService).exportDatabase();
        assertEquals(defaultTeam, saved.getTeam(), "Default team should be applied");
    }

    @Test
    void processSSOPostLogin_autoCreatesUserWhenMissing()
            throws IllegalArgumentException, SQLException, UnsupportedProviderException {
        String username = "autoUser";
        doReturn(true).when(userService).isUsernameValid(username);
        when(userRepository.findBySsoProviderAndSsoProviderId("prov", "id"))
                .thenReturn(Optional.empty());
        when(userRepository.findByUsernameIgnoreCase(username)).thenReturn(Optional.empty());
        User created = new User();
        doReturn(created).when(userService).saveUserCore(any(SaveUserRequest.class));

        userService.processSSOPostLogin(username, "id", "prov", true, AuthenticationType.SAML2);

        ArgumentCaptor<SaveUserRequest> reqCaptor = ArgumentCaptor.forClass(SaveUserRequest.class);
        verify(userService).saveUserCore(reqCaptor.capture());
        SaveUserRequest captured = reqCaptor.getValue();

        assertEquals(username, captured.getUsername());
        assertEquals("id", captured.getSsoProviderId());
        assertEquals("prov", captured.getSsoProvider());
        assertEquals(AuthenticationType.SAML2, captured.getAuthenticationType());
    }

    @Test
    void getCurrentUsernameReturnsNullWhenAuthenticationMissing() {
        SecurityContextHolder.clearContext();

        assertNull(userService.getCurrentUsername());
    }

    @Test
    void getCurrentUsernameReturnsUsernameForAuthenticatedPrincipal() {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(
                                "alice", "n/a", java.util.List.of()));

        assertEquals("alice", userService.getCurrentUsername());

        SecurityContextHolder.clearContext();
    }

    @Test
    void addApiKeyToUserGeneratesAndPersists() {
        User user = new User();
        user.setUsername("user");
        when(userRepository.findByUsernameIgnoreCase("user")).thenReturn(Optional.of(user));
        when(userRepository.findByApiKey(any())).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        User updated = userService.addApiKeyToUser("user");

        assertNotNull(updated.getApiKey());
        verify(userRepository).save(user);
    }

    @Test
    void getApiKeyForUserCreatesWhenMissing() {
        User user = new User();
        user.setUsername("user");
        when(userRepository.findByUsernameIgnoreCase("user")).thenReturn(Optional.of(user));
        when(userRepository.findByApiKey(any())).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        String apiKey = userService.getApiKeyForUser("user");

        assertNotNull(apiKey);
        verify(userRepository).save(user);
    }

    @Test
    void isUsernameValidRejectsReservedAndAcceptsEmail() {
        assertFalse(userService.isUsernameValid("ALL_USERS"));
        assertTrue(userService.isUsernameValid("valid@example.com"));
    }
}
