package stirling.software.proprietary.security.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.security.Principal;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.enterprise.inject.Instance;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.api.user.UsernameAndPass;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;
import stirling.software.proprietary.service.UserLicenseSettingsService;

/**
 * Migration (Spring MockMvc -> direct JAX-RS calls): {@code UserController} now returns {@code
 * jakarta.ws.rs.core.Response}; the caller identity is read from an injected JAX-RS {@code
 * SecurityContext} (was a Spring {@code Authentication}/{@code Principal} method parameter) and the
 * optional {@code EmailService} became a CDI {@code Instance<EmailService>}. Each test invokes the
 * controller method directly and asserts the status code / entity map. The {@code securityContext}
 * field is assigned a per-test mock (package-private, no CDI container).
 */
@ExtendWith(MockitoExtension.class)
class UserControllerTest {

    @Mock private UserService userService;
    @Mock private SessionPersistentRegistry sessionRegistry;
    @Mock private TeamRepository teamRepository;
    @Mock private UserRepository userRepository;
    @Mock private EmailService emailService;
    @Mock private UserLicenseSettingsService licenseSettingsService;
    @Mock private LoginAttemptService loginAttemptService;

    private ApplicationProperties applicationProperties;
    private UserController controller;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        applicationProperties.getPremium().setMaxUsers(10);
        applicationProperties.getMail().setEnabled(true);

        controller =
                new UserController(
                        userService,
                        sessionRegistry,
                        applicationProperties,
                        teamRepository,
                        userRepository,
                        emailServiceInstance(),
                        licenseSettingsService,
                        loginAttemptService);
    }

    @SuppressWarnings("unchecked")
    private Instance<EmailService> emailServiceInstance() {
        Instance<EmailService> instance = mock(Instance.class);
        lenient().when(instance.isResolvable()).thenReturn(true);
        lenient().when(instance.get()).thenReturn(emailService);
        return instance;
    }

    private void authenticateAs(String username) {
        SecurityContext securityContext = mock(SecurityContext.class);
        Principal principal = () -> username;
        lenient().when(securityContext.getUserPrincipal()).thenReturn(principal);
        controller.securityContext = securityContext;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> body(Response response) {
        return (Map<String, Object>) response.getEntity();
    }

    @Test
    void registerRejectsExistingUser() throws Exception {
        UsernameAndPass payload = new UsernameAndPass();
        payload.setUsername("existing@example.com");
        payload.setPassword("pw");
        when(userService.usernameExistsIgnoreCase("existing@example.com")).thenReturn(true);

        Response response = controller.register(payload);

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
        assertEquals("User already exists", body(response).get("error"));

        verify(userService, never()).saveUserCore(any());
    }

    @Test
    void registerCreatesUserWhenValid() throws Exception {
        UsernameAndPass payload = new UsernameAndPass();
        payload.setUsername("new@example.com");
        payload.setPassword("pw");
        Team defaultTeam = new Team();
        defaultTeam.setName(TeamService.DEFAULT_TEAM_NAME);

        when(userService.usernameExistsIgnoreCase("new@example.com")).thenReturn(false);
        when(userService.isUsernameValid("new@example.com")).thenReturn(true);
        when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
        when(teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME))
                .thenReturn(Optional.of(defaultTeam));

        User savedUser = new User();
        savedUser.setUsername("new@example.com");
        savedUser.setEnabled(false);
        when(userService.saveUserCore(any())).thenReturn(savedUser);

        Response response = controller.register(payload);

        assertEquals(Response.Status.CREATED.getStatusCode(), response.getStatus());
        @SuppressWarnings("unchecked")
        Map<String, Object> user = (Map<String, Object>) body(response).get("user");
        assertEquals("new@example.com", user.get("username"));
    }

    @Test
    void changeUserEnabledPreventsSelfDisable() throws Exception {
        User user = new User();
        user.setUsername("admin");
        when(userService.usernameExistsIgnoreCase("admin")).thenReturn(true);
        when(userService.findByUsernameIgnoreCase("admin")).thenReturn(Optional.of(user));
        authenticateAs("admin");

        Response response = controller.changeUserEnabled("admin", false);

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
        assertEquals("Cannot disable your own account.", body(response).get("error"));
    }

    @Test
    void deleteUserRejectsMissingUser() throws Exception {
        authenticateAs("ghost");
        when(userService.usernameExistsIgnoreCase("ghost")).thenReturn(false);

        Response response = controller.deleteUser("ghost");

        assertEquals(Response.Status.NOT_FOUND.getStatusCode(), response.getStatus());
        assertEquals("User not found.", body(response).get("error"));
    }

    @Test
    void unlockUserCallsResetAttemptsAndReturnsOk() {
        Response response = controller.unlockUser("lockeduser");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals("User account unlocked successfully", body(response).get("message"));

        verify(loginAttemptService).resetAttempts("lockeduser");
    }
}
