package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.sql.SQLException;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.MessageSource;
import org.springframework.security.crypto.password.PasswordEncoder;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
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

    @Mock private SessionPersistentRegistry sessionPersistentRegistry;

    @Mock private DatabaseServiceInterface databaseService;

    @Mock private ApplicationProperties.Security.OAUTH2 oauth2Properties;

    @InjectMocks private UserService userService;

    private Team mockTeam;
    private User mockUser;

    @BeforeEach
    void setUp() {
        mockTeam = new Team();
        mockTeam.setId(1L);
        mockTeam.setName("Test Team");

        mockUser = new User();
        mockUser.setId(1L);
        mockUser.setUsername("testuser");
        mockUser.setEnabled(true);
    }

    @Test
    void testSaveUser_WithUsernameAndAuthenticationType_Success() throws Exception {
        // Given
        String username = "testuser";
        AuthenticationType authType = AuthenticationType.WEB;

        when(teamRepository.findByName("Default")).thenReturn(Optional.of(mockTeam));
        when(userRepository.save(any(User.class))).thenReturn(mockUser);
        doNothing().when(databaseService).exportDatabase();

        // When
        userService.saveUser(username, authType);

        // Then
        verify(userRepository).save(any(User.class));
        verify(databaseService).exportDatabase();
    }

    @Test
    void testSaveUser_WithUsernamePasswordAndTeamId_Success() throws Exception {
        // Given
        String username = "testuser";
        String password = "password123";
        Long teamId = 1L;
        String encodedPassword = "encodedPassword123";

        when(passwordEncoder.encode(password)).thenReturn(encodedPassword);
        when(teamRepository.findById(teamId)).thenReturn(Optional.of(mockTeam));
        when(userRepository.save(any(User.class))).thenReturn(mockUser);
        doNothing().when(databaseService).exportDatabase();

        // When
        User result = userService.saveUser(username, password, teamId);

        // Then
        assertNotNull(result);
        verify(passwordEncoder).encode(password);
        verify(teamRepository).findById(teamId);
        verify(userRepository).save(any(User.class));
        verify(databaseService).exportDatabase();
    }

    @Test
    void testSaveUser_WithTeamAndRole_Success() throws Exception {
        // Given
        String username = "testuser";
        String password = "password123";
        String role = Role.ADMIN.getRoleId();
        boolean firstLogin = true;
        String encodedPassword = "encodedPassword123";

        when(passwordEncoder.encode(password)).thenReturn(encodedPassword);
        when(userRepository.save(any(User.class))).thenReturn(mockUser);
        doNothing().when(databaseService).exportDatabase();

        // When
        User result = userService.saveUser(username, password, mockTeam, role, firstLogin);

        // Then
        assertNotNull(result);
        verify(passwordEncoder).encode(password);
        verify(userRepository).save(any(User.class));
        verify(databaseService).exportDatabase();
    }

    @Test
    void testSaveUser_WithInvalidUsername_ThrowsException() throws Exception {
        // Given
        String invalidUsername = "ab"; // Too short (less than 3 characters)
        AuthenticationType authType = AuthenticationType.WEB;

        // When & Then
        IllegalArgumentException exception =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> userService.saveUser(invalidUsername, authType));

        verify(userRepository, never()).save(any(User.class));
        verify(databaseService, never()).exportDatabase();
    }

    @Test
    void testSaveUser_WithNullPassword_Success() throws Exception {
        // Given
        String username = "testuser";
        Long teamId = 1L;

        when(teamRepository.findById(teamId)).thenReturn(Optional.of(mockTeam));
        when(userRepository.save(any(User.class))).thenReturn(mockUser);
        doNothing().when(databaseService).exportDatabase();

        // When
        User result = userService.saveUser(username, null, teamId);

        // Then
        assertNotNull(result);
        verify(passwordEncoder, never()).encode(anyString());
        verify(userRepository).save(any(User.class));
        verify(databaseService).exportDatabase();
    }

    @Test
    void testSaveUser_WithEmptyPassword_Success() throws Exception {
        // Given
        String username = "testuser";
        String emptyPassword = "";
        Long teamId = 1L;

        when(teamRepository.findById(teamId)).thenReturn(Optional.of(mockTeam));
        when(userRepository.save(any(User.class))).thenReturn(mockUser);
        doNothing().when(databaseService).exportDatabase();

        // When
        User result = userService.saveUser(username, emptyPassword, teamId);

        // Then
        assertNotNull(result);
        verify(passwordEncoder, never()).encode(anyString());
        verify(userRepository).save(any(User.class));
        verify(databaseService).exportDatabase();
    }

    @Test
    void testSaveUser_WithValidEmail_Success() throws Exception {
        // Given
        String emailUsername = "test@example.com";
        AuthenticationType authType = AuthenticationType.OAUTH2;

        when(teamRepository.findByName("Default")).thenReturn(Optional.of(mockTeam));
        when(userRepository.save(any(User.class))).thenReturn(mockUser);
        doNothing().when(databaseService).exportDatabase();

        // When
        userService.saveUser(emailUsername, authType);

        // Then
        verify(userRepository).save(any(User.class));
        verify(databaseService).exportDatabase();
    }

    @Test
    void testSaveUser_WithReservedUsername_ThrowsException() throws Exception {
        // Given
        String reservedUsername = "all_users";
        AuthenticationType authType = AuthenticationType.WEB;

        // When & Then
        IllegalArgumentException exception =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> userService.saveUser(reservedUsername, authType));

        verify(userRepository, never()).save(any(User.class));
        verify(databaseService, never()).exportDatabase();
    }

    @Test
    void testSaveUser_WithAnonymousUser_ThrowsException() throws Exception {
        // Given
        String anonymousUsername = "anonymoususer";
        AuthenticationType authType = AuthenticationType.WEB;

        // When & Then
        IllegalArgumentException exception =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> userService.saveUser(anonymousUsername, authType));

        verify(userRepository, never()).save(any(User.class));
        verify(databaseService, never()).exportDatabase();
    }

    @Test
    void testSaveUser_DatabaseExportThrowsException_StillSavesUser() throws Exception {
        // Given
        String username = "testuser";
        String password = "password123";
        Long teamId = 1L;
        String encodedPassword = "encodedPassword123";

        when(passwordEncoder.encode(password)).thenReturn(encodedPassword);
        when(teamRepository.findById(teamId)).thenReturn(Optional.of(mockTeam));
        when(userRepository.save(any(User.class))).thenReturn(mockUser);
        doThrow(new SQLException("Database export failed")).when(databaseService).exportDatabase();

        // When & Then
        assertThrows(SQLException.class, () -> userService.saveUser(username, password, teamId));

        // Verify user was still saved before the exception
        verify(userRepository).save(any(User.class));
        verify(databaseService).exportDatabase();
    }

    @Test
    void testSaveUser_WithFirstLoginFlag_Success() throws Exception {
        // Given
        String username = "testuser";
        String password = "password123";
        Long teamId = 1L;
        boolean firstLogin = true;
        boolean enabled = false;
        String encodedPassword = "encodedPassword123";

        when(passwordEncoder.encode(password)).thenReturn(encodedPassword);
        when(teamRepository.findById(teamId)).thenReturn(Optional.of(mockTeam));
        when(userRepository.save(any(User.class))).thenReturn(mockUser);
        doNothing().when(databaseService).exportDatabase();

        // When
        userService.saveUser(username, password, teamId, firstLogin, enabled);

        // Then
        verify(passwordEncoder).encode(password);
        verify(userRepository).save(any(User.class));
        verify(databaseService).exportDatabase();
    }

    @Test
    void testSaveUser_WithCustomRole_Success() throws Exception {
        // Given
        String username = "testuser";
        String password = "password123";
        Long teamId = 1L;
        String customRole = Role.LIMITED_API_USER.getRoleId();
        String encodedPassword = "encodedPassword123";

        when(passwordEncoder.encode(password)).thenReturn(encodedPassword);
        when(teamRepository.findById(teamId)).thenReturn(Optional.of(mockTeam));
        when(userRepository.save(any(User.class))).thenReturn(mockUser);
        doNothing().when(databaseService).exportDatabase();

        // When
        userService.saveUser(username, password, teamId, customRole);

        // Then
        verify(passwordEncoder).encode(password);
        verify(userRepository).save(any(User.class));
        verify(databaseService).exportDatabase();
    }
}
