package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

import java.sql.SQLException;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.MessageSource;
import org.springframework.security.crypto.password.PasswordEncoder;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.AuthorityRepository;
import stirling.software.proprietary.security.database.repository.PersistentLoginRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.repository.FileShareAccessRepository;
import stirling.software.proprietary.storage.repository.FileShareRepository;
import stirling.software.proprietary.storage.repository.StorageCleanupEntryRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.repository.WorkflowSessionRepository;
import stirling.software.proprietary.workflow.service.UserServerCertificateService;

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
    @Mock private PersistentLoginRepository persistentLoginRepository;
    @Mock private UserServerCertificateService userServerCertificateService;
    @Mock private WorkflowParticipantRepository workflowParticipantRepository;
    @Mock private WorkflowSessionRepository workflowSessionRepository;
    @Mock private StoredFileRepository storedFileRepository;
    @Mock private StorageCleanupEntryRepository storageCleanupEntryRepository;
    @Mock private FileShareRepository fileShareRepository;
    @Mock private FileShareAccessRepository fileShareAccessRepository;

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

    @Test
    void deleteUser_withRelatedData_cleansUpInCorrectOrder() {
        User user = new User();
        user.setId(1L);
        user.setUsername("target");

        FileShare share = new FileShare();
        StoredFile ownedFile = new StoredFile();
        ownedFile.setOwner(user);
        ownedFile.setStorageKey("key-main");
        ownedFile.setHistoryStorageKey("key-history");
        Set<FileShare> shares = new HashSet<>();
        shares.add(share);
        ownedFile.setShares(shares);

        WorkflowSession session = new WorkflowSession();
        session.setOwner(user);

        FileShare inboundShare = new FileShare();
        when(userRepository.findByUsernameIgnoreCase("target")).thenReturn(Optional.of(user));
        when(workflowSessionRepository.findByOwnerOrderByCreatedAtDesc(user))
                .thenReturn(List.of(session));
        when(storedFileRepository.findAllByOwner(user)).thenReturn(List.of(ownedFile));
        when(fileShareRepository.findBySharedWithUser(user)).thenReturn(List.of(inboundShare));

        userService.deleteUser("target");

        verify(userServerCertificateService).deleteUserCertificate(1L);
        verify(fileShareAccessRepository).deleteByUser(user);
        // Inbound share (file shared with this user by others) cleaned up
        verify(fileShareAccessRepository).deleteByFileShare(inboundShare);
        verify(fileShareRepository).deleteAll(List.of(inboundShare));
        // Participant records in others' sessions de-linked (not deleted) to preserve audit trail
        verify(workflowParticipantRepository).clearUserReferences(user);
        verify(storedFileRepository).clearWorkflowSessionReferencesByOwner(user);
        verify(workflowSessionRepository).deleteAll(List.of(session));
        verify(fileShareAccessRepository).deleteByFileShare(share);
        verify(storedFileRepository).deleteAll(List.of(ownedFile));
        verify(userRepository).delete(user);
        // Persistent login (remember-me) tokens revoked
        verify(persistentLoginRepository).deleteByUsername("target");
        // Storage blobs scheduled for physical deletion
        verify(storageCleanupEntryRepository, times(2)).save(any());
        verify(userService).invalidateUserSessions("target");
    }

    @Test
    void deleteUser_withNoRelatedData_deletesUserSuccessfully() {
        User user = new User();
        user.setId(2L);
        user.setUsername("clean");

        when(userRepository.findByUsernameIgnoreCase("clean")).thenReturn(Optional.of(user));
        when(workflowSessionRepository.findByOwnerOrderByCreatedAtDesc(user)).thenReturn(List.of());
        when(storedFileRepository.findAllByOwner(user)).thenReturn(List.of());
        when(fileShareRepository.findBySharedWithUser(user)).thenReturn(List.of());

        userService.deleteUser("clean");

        verify(userRepository).delete(user);
        verify(fileShareAccessRepository, never()).deleteByFileShare(any());
        verify(workflowSessionRepository).deleteAll(List.of());
        verify(storedFileRepository).deleteAll(List.of());
    }

    @Test
    void deleteUser_internalApiUser_isNotDeleted() {
        Authority internalAuth = new Authority();
        internalAuth.setAuthority(Role.INTERNAL_API_USER.getRoleId());
        User user = new User();
        user.setId(3L);
        user.setUsername("internal");
        user.getAuthorities().add(internalAuth);

        when(userRepository.findByUsernameIgnoreCase("internal")).thenReturn(Optional.of(user));

        userService.deleteUser("internal");

        verify(userRepository, never()).delete(any());
        verify(workflowSessionRepository, never()).findByOwnerOrderByCreatedAtDesc(any());
    }
}
