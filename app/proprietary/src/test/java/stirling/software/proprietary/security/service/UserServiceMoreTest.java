package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.MessageSource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
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
import stirling.software.proprietary.storage.repository.FileShareAccessRepository;
import stirling.software.proprietary.storage.repository.FileShareRepository;
import stirling.software.proprietary.storage.repository.StorageCleanupEntryRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.repository.WorkflowSessionRepository;
import stirling.software.proprietary.workflow.service.UserServerCertificateService;

@ExtendWith(MockitoExtension.class)
@DisplayName("UserService - additional coverage")
class UserServiceMoreTest {

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

    @InjectMocks private UserService userService;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    private static User user(String username) {
        User u = new User();
        u.setUsername(username);
        return u;
    }

    @Nested
    @DisplayName("API key lookups")
    class ApiKeyLookups {

        @Test
        @DisplayName("getAuthentication returns token for a valid key")
        void getAuthenticationValid() {
            User u = user("api");
            u.addAuthority(new Authority("ROLE_USER", u));
            when(userRepository.findByApiKey("k")).thenReturn(Optional.of(u));

            assertThat(userService.getAuthentication("k")).isNotNull();
        }

        @Test
        @DisplayName("getAuthentication throws when key is unknown")
        void getAuthenticationInvalid() {
            when(userRepository.findByApiKey("bad")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> userService.getAuthentication("bad"))
                    .isInstanceOf(UsernameNotFoundException.class);
        }

        @Test
        @DisplayName("isValidApiKey reflects repository presence")
        void isValidApiKey() {
            when(userRepository.findByApiKey("k")).thenReturn(Optional.of(user("x")));
            assertThat(userService.isValidApiKey("k")).isTrue();
        }

        @Test
        @DisplayName("loadUserByApiKey returns null when absent")
        void loadUserByApiKeyAbsent() {
            when(userRepository.findByApiKey("missing")).thenReturn(Optional.empty());
            assertThat(userService.loadUserByApiKey("missing")).isNull();
        }

        @Test
        @DisplayName("validateApiKeyForUser matches stored key")
        void validateApiKeyForUser() {
            User u = user("bob");
            u.setApiKey("secret");
            when(userRepository.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(u));

            assertThat(userService.validateApiKeyForUser("bob", "secret")).isTrue();
            assertThat(userService.validateApiKeyForUser("bob", "wrong")).isFalse();
        }

        @Test
        @DisplayName("getCurrentUserApiKey throws when no current user")
        void getCurrentUserApiKeyNoUser() {
            SecurityContextHolder.clearContext();
            assertThatThrownBy(() -> userService.getCurrentUserApiKey())
                    .isInstanceOf(IllegalStateException.class);
        }
    }

    @Nested
    @DisplayName("existence and counts")
    class ExistenceAndCounts {

        @Test
        @DisplayName("usernameExists true when found")
        void usernameExists() {
            when(userRepository.findByUsername("a")).thenReturn(Optional.of(user("a")));
            assertThat(userService.usernameExists("a")).isTrue();
        }

        @Test
        @DisplayName("hasUsers excludes the internal API user from the count")
        void hasUsersExcludesInternal() {
            when(userRepository.count()).thenReturn(1L);
            when(userRepository.findByUsernameIgnoreCase(Role.INTERNAL_API_USER.getRoleId()))
                    .thenReturn(Optional.of(user("internal")));

            assertThat(userService.hasUsers()).isFalse();
        }

        @Test
        @DisplayName("getTotalUsersCount subtracts the internal API user")
        void totalUsersCount() {
            when(userRepository.count()).thenReturn(3L);
            when(userRepository.findByUsernameIgnoreCase(Role.INTERNAL_API_USER.getRoleId()))
                    .thenReturn(Optional.empty());

            assertThat(userService.getTotalUsersCount()).isEqualTo(3L);
        }

        @Test
        @DisplayName("countOAuthUsers delegates to repository")
        void countOAuthUsers() {
            when(userRepository.countSsoUsers()).thenReturn(7L);
            assertThat(userService.countOAuthUsers()).isEqualTo(7L);
        }
    }

    @Nested
    @DisplayName("attribute mutations export the database")
    class AttributeMutations {

        @Test
        @DisplayName("changePassword encodes and persists")
        void changePassword() throws SQLException, UnsupportedProviderException {
            User u = user("p");
            when(passwordEncoder.encode("new")).thenReturn("enc");

            userService.changePassword(u, "new");

            assertThat(u.getPassword()).isEqualTo("enc");
            verify(userRepository).save(u);
            verify(databaseService).exportDatabase();
        }

        @Test
        @DisplayName("changeFirstUse persists the flag")
        void changeFirstUse() throws SQLException, UnsupportedProviderException {
            User u = user("p");

            userService.changeFirstUse(u, false);

            assertThat(u.isFirstLogin()).isFalse();
            verify(userRepository).save(u);
        }

        @Test
        @DisplayName("changeUserEnabled persists the flag")
        void changeUserEnabled() throws SQLException, UnsupportedProviderException {
            User u = user("p");

            userService.changeUserEnabled(u, true);

            assertThat(u.isEnabled()).isTrue();
            verify(userRepository).save(u);
        }

        @Test
        @DisplayName("changeRole updates the authority")
        void changeRole() throws SQLException, UnsupportedProviderException {
            User u = user("p");
            u.setId(5L);
            Authority authority = new Authority("ROLE_USER", u);
            when(authorityRepository.findByUserId(5L)).thenReturn(authority);

            userService.changeRole(u, "ROLE_ADMIN");

            assertThat(authority.getAuthority()).isEqualTo("ROLE_ADMIN");
            verify(authorityRepository).save(authority);
        }

        @Test
        @DisplayName("changeUsername rejects an invalid new username")
        void changeUsernameInvalid() {
            when(messageSource.getMessage(any(), any(), any())).thenReturn("bad");

            assertThatThrownBy(() -> userService.changeUsername(user("p"), "ALL_USERS"))
                    .isInstanceOf(IllegalArgumentException.class);
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("changeUserTeam falls back to the default team for null")
        void changeUserTeamNullUsesDefault() throws SQLException, UnsupportedProviderException {
            User u = user("p");
            Team defaultTeam = new Team();
            defaultTeam.setName("Default");
            when(teamRepository.findByName("Default")).thenReturn(Optional.of(defaultTeam));

            userService.changeUserTeam(u, null);

            assertThat(u.getTeam()).isSameAs(defaultTeam);
        }
    }

    @Nested
    @DisplayName("authentication type and password helpers")
    class AuthTypeHelpers {

        @Test
        @DisplayName("isPasswordCorrect delegates to the encoder")
        void isPasswordCorrect() {
            User u = user("p");
            u.setPassword("hash");
            when(passwordEncoder.matches("plain", "hash")).thenReturn(true);

            assertThat(userService.isPasswordCorrect(u, "plain")).isTrue();
        }

        @Test
        @DisplayName("isSsoAuthenticationTypeByUsername true for OAUTH2")
        void isSsoTrueForOauth() {
            User u = user("p");
            u.setAuthenticationType(AuthenticationType.OAUTH2);
            when(userRepository.findByUsernameIgnoreCase("p")).thenReturn(Optional.of(u));

            assertThat(userService.isSsoAuthenticationTypeByUsername("p")).isTrue();
        }

        @Test
        @DisplayName("isSsoAuthenticationTypeByUsername false for WEB")
        void isSsoFalseForWeb() {
            User u = user("p");
            u.setAuthenticationType(AuthenticationType.WEB);
            when(userRepository.findByUsernameIgnoreCase("p")).thenReturn(Optional.of(u));

            assertThat(userService.isSsoAuthenticationTypeByUsername("p")).isFalse();
        }

        @Test
        @DisplayName("isAuthenticationTypeByUsername matches the stored type")
        void isAuthenticationTypeByUsername() {
            User u = user("p");
            u.setAuthenticationType(AuthenticationType.WEB);
            when(userRepository.findByUsernameIgnoreCase("p")).thenReturn(Optional.of(u));

            assertThat(userService.isAuthenticationTypeByUsername("p", AuthenticationType.WEB))
                    .isTrue();
        }

        @Test
        @DisplayName("isUserDisabled true when user is disabled")
        void isUserDisabled() {
            User u = user("p");
            u.setEnabled(false);
            when(userRepository.findByUsernameIgnoreCase("p")).thenReturn(Optional.of(u));

            assertThat(userService.isUserDisabled("p")).isTrue();
        }

        @Test
        @DisplayName("hasPassword false when user is absent")
        void hasPasswordAbsent() {
            when(userRepository.findByUsernameIgnoreCase("p")).thenReturn(Optional.empty());
            assertThat(userService.hasPassword("p")).isFalse();
        }
    }

    @Nested
    @DisplayName("current user resolution")
    class CurrentUser {

        @Test
        @DisplayName("getCurrentUsername reads the string principal")
        void getCurrentUsernameString() {
            UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken("alice", null, List.of());
            SecurityContextHolder.getContext().setAuthentication(auth);

            assertThat(userService.getCurrentUsername()).isEqualTo("alice");
        }

        @Test
        @DisplayName("isCurrentUserAdmin true when the admin authority is present")
        void isCurrentUserAdminTrue() {
            UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(
                            "admin",
                            null,
                            List.of(new SimpleGrantedAuthority(Role.ADMIN.getRoleId())));
            SecurityContextHolder.getContext().setAuthentication(auth);

            assertThat(userService.isCurrentUserAdmin()).isTrue();
        }

        @Test
        @DisplayName("isCurrentUserAdmin false for anonymous principal")
        void isCurrentUserAdminAnonymous() {
            UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken("anonymousUser", null, List.of());
            SecurityContextHolder.getContext().setAuthentication(auth);

            assertThat(userService.isCurrentUserAdmin()).isFalse();
        }
    }

    @Nested
    @DisplayName("settings and sessions")
    class SettingsAndSessions {

        @Test
        @DisplayName("updateUserSettings replaces the settings map and exports")
        void updateUserSettings() throws SQLException, UnsupportedProviderException {
            User u = user("p");
            when(userRepository.findByUsernameIgnoreCaseWithSettings("p"))
                    .thenReturn(Optional.of(u));

            userService.updateUserSettings("p", Map.of("theme", "dark"));

            assertThat(u.getSettings()).containsEntry("theme", "dark");
            verify(userRepository).save(u);
            verify(databaseService).exportDatabase();
        }

        @Test
        @DisplayName("invalidateUserSessions expires sessions for the matching principal")
        void invalidateUserSessions() {
            when(sessionRegistry.getAllPrincipals()).thenReturn(List.of("p"));
            SessionInformation info = new SessionInformation("p", "sess-9", new java.util.Date());
            when(sessionRegistry.getAllSessions("p", false)).thenReturn(List.of(info));

            userService.invalidateUserSessions("p");

            verify(sessionRegistry).expireSession("sess-9");
        }
    }

    @Nested
    @DisplayName("grandfathering and custom API user")
    class Grandfathering {

        @Test
        @DisplayName("grandfatherAllOAuthUsers marks and saves unflagged users")
        void grandfatherAllOAuthUsers() {
            User flagged = user("a");
            flagged.setOauthGrandfathered(true);
            User unflagged = user("b");
            unflagged.setOauthGrandfathered(false);
            when(userRepository.findAllSsoUsers()).thenReturn(List.of(flagged, unflagged));

            int updated = userService.grandfatherAllOAuthUsers();

            assertThat(updated).isEqualTo(1);
            assertThat(unflagged.isOauthGrandfathered()).isTrue();
            verify(userRepository).saveAll(any());
        }

        @Test
        @DisplayName("grandfatherAllOAuthUsers skips persistence when nothing changed")
        void grandfatherAllOAuthUsersNoChange() {
            User flagged = user("a");
            flagged.setOauthGrandfathered(true);
            when(userRepository.findAllSsoUsers()).thenReturn(List.of(flagged));

            assertThat(userService.grandfatherAllOAuthUsers()).isZero();
            verify(userRepository, never()).saveAll(any());
        }

        @Test
        @DisplayName("syncCustomApiUser is a no-op for a blank key")
        void syncCustomApiUserBlank() {
            userService.syncCustomApiUser("   ");
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("syncCustomApiUser creates the user when missing")
        void syncCustomApiUserCreates() {
            when(userRepository.findByUsernameIgnoreCase("CUSTOM_API_USER"))
                    .thenReturn(Optional.empty());

            userService.syncCustomApiUser("custom-key");

            ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
            verify(userRepository).save(captor.capture());
            assertThat(captor.getValue().getApiKey()).isEqualTo("custom-key");
            assertThat(captor.getValue().getUsername()).isEqualTo("CUSTOM_API_USER");
        }

        @Test
        @DisplayName("refreshApiKeyForUser regenerates and persists")
        void refreshApiKeyForUser() {
            User u = user("r");
            u.setApiKey("old");
            when(userRepository.findByUsernameIgnoreCase("r")).thenReturn(Optional.of(u));
            when(userRepository.findByApiKey(any())).thenReturn(Optional.empty());
            when(userRepository.save(any(User.class)))
                    .thenAnswer(inv -> inv.getArgument(0, User.class));

            User updated = userService.refreshApiKeyForUser("r");

            assertThat(updated.getApiKey()).isNotEqualTo("old");
            assertThat(UUID.fromString(updated.getApiKey())).isNotNull();
        }
    }
}
