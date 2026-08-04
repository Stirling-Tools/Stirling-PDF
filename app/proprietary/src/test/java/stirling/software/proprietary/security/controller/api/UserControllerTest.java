package stirling.software.proprietary.security.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import io.quarkus.hibernate.orm.panache.PanacheQuery;

import jakarta.enterprise.inject.Instance;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.api.security.UserSummaryDTO;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.api.user.UsernameAndPass;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.TeamMembershipService;
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
    @Mock private TeamMembershipService teamMembershipService;

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
                        loginAttemptService,
                        teamMembershipService);
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

    // ---------------------------------------------------------------------
    // GET /api/v1/user/users - storage.signing.userListScope scoping
    // ---------------------------------------------------------------------

    private static User user(long id, String username, boolean enabled, Team team) {
        User u = new User();
        u.setId(id);
        u.setUsername(username);
        u.setEnabled(enabled);
        u.setTeam(team);
        return u;
    }

    private static Team team(long id, String name) {
        Team t = new Team();
        t.setId(id);
        t.setName(name);
        return t;
    }

    // Panache findAll() hands back a query the controller calls list() on.
    @SuppressWarnings("unchecked")
    private static PanacheQuery<User> queryOf(User... users) {
        PanacheQuery<User> query = mock(PanacheQuery.class);
        when(query.<User>list()).thenReturn(List.of(users));
        return query;
    }

    @SuppressWarnings("unchecked")
    private static List<UserSummaryDTO> userList(Response response) {
        return (List<UserSummaryDTO>) response.getEntity();
    }

    // No principal at all: JAX-RS still injects a context, getUserPrincipal() is just null.
    private void unauthenticated() {
        controller.securityContext = mock(SecurityContext.class);
    }

    @Test
    void listUsersDefaultScopeIsOrgWide() {
        // Default "org" scope returns every enabled user via findAll(), no team lookup.
        Team alpha = team(1L, "alpha");
        when(userRepository.findAll())
                .thenReturn(
                        queryOf(
                                user(1L, "a@alpha.com", true, alpha),
                                user(2L, "b@alpha.com", true, alpha)));
        authenticateAs("a@alpha.com");

        Response response = controller.listUsers();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        List<UserSummaryDTO> users = userList(response);
        assertEquals(2, users.size());
        assertEquals("a@alpha.com", users.get(0).getUsername());
        assertEquals("b@alpha.com", users.get(1).getUsername());

        // Caller is resolved (for the anonymous-gate) but org scope still uses findAll, not team.
        verify(userRepository, never()).findAllByTeamId(any());
    }

    @Test
    void listUsersForbiddenForAnonymousCaller() {
        // Anonymous SaaS accounts must never enumerate users, regardless of scope.
        User anon = user(1L, "anon_abc", true, team(1L, TeamService.DEFAULT_TEAM_NAME));
        anon.setAuthenticationType(AuthenticationType.ANONYMOUS);
        when(userService.findByUsernameIgnoreCase("anon_abc")).thenReturn(Optional.of(anon));
        authenticateAs("anon_abc");

        Response response = controller.listUsers();

        assertEquals(Response.Status.FORBIDDEN.getStatusCode(), response.getStatus());

        verify(userRepository, never()).findAll();
        verify(userRepository, never()).findAllByTeamId(any());
    }

    @Test
    void listUsersOrgScopeFiltersDisabledUsers() {
        Team alpha = team(1L, "alpha");
        when(userRepository.findAll())
                .thenReturn(
                        queryOf(
                                user(1L, "enabled@alpha.com", true, alpha),
                                user(2L, "disabled@alpha.com", false, alpha)));
        authenticateAs("enabled@alpha.com");

        Response response = controller.listUsers();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        List<UserSummaryDTO> users = userList(response);
        assertEquals(1, users.size());
        assertEquals("enabled@alpha.com", users.get(0).getUsername());
    }

    @Test
    void listUsersTeamScopeReturnsOnlyCallerTeam() {
        applicationProperties.getStorage().getSigning().setUserListScope("team");
        Team alpha = team(7L, "alpha");
        User caller = user(1L, "caller@alpha.com", true, alpha);
        when(userService.findByUsernameIgnoreCase("caller@alpha.com"))
                .thenReturn(Optional.of(caller));
        when(userRepository.findAllByTeamId(7L))
                .thenReturn(List.of(caller, user(2L, "mate@alpha.com", true, alpha)));
        authenticateAs("caller@alpha.com");

        Response response = controller.listUsers();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        List<UserSummaryDTO> users = userList(response);
        assertEquals(2, users.size());
        assertEquals("alpha", users.get(0).getTeamName());

        verify(userRepository).findAllByTeamId(7L);
        verify(userRepository, never()).findAll();
    }

    @Test
    void listUsersTeamScopeWithMissingCallerReturnsEmpty() {
        applicationProperties.getStorage().getSigning().setUserListScope("team");
        when(userService.findByUsernameIgnoreCase("ghost@alpha.com")).thenReturn(Optional.empty());
        authenticateAs("ghost@alpha.com");

        Response response = controller.listUsers();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(0, userList(response).size());

        verify(userRepository, never()).findAllByTeamId(any());
        verify(userRepository, never()).findAll();
    }

    @Test
    void listUsersTeamScopeWithNullTeamReturnsSelfOnly() {
        applicationProperties.getStorage().getSigning().setUserListScope("team");
        User caller = user(1L, "solo@nowhere.com", true, null);
        when(userService.findByUsernameIgnoreCase("solo@nowhere.com"))
                .thenReturn(Optional.of(caller));
        authenticateAs("solo@nowhere.com");

        Response response = controller.listUsers();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        List<UserSummaryDTO> users = userList(response);
        assertEquals(1, users.size());
        assertEquals("solo@nowhere.com", users.get(0).getUsername());

        verify(userRepository, never()).findAllByTeamId(any());
        verify(userRepository, never()).findAll();
    }

    @Test
    void listUsersTeamScopeOnDefaultTeamReturnsSelfOnly() {
        // A caller on a shared system team must not enumerate its members.
        applicationProperties.getStorage().getSigning().setUserListScope("team");
        Team defaultTeam = team(1L, TeamService.DEFAULT_TEAM_NAME);
        User caller = user(1L, "new@saas.com", true, defaultTeam);
        when(userService.findByUsernameIgnoreCase("new@saas.com")).thenReturn(Optional.of(caller));
        authenticateAs("new@saas.com");

        Response response = controller.listUsers();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        List<UserSummaryDTO> users = userList(response);
        assertEquals(1, users.size());
        assertEquals("new@saas.com", users.get(0).getUsername());

        verify(userRepository, never()).findAllByTeamId(any());
        verify(userRepository, never()).findAll();
    }

    @Test
    void listUsersTeamScopeOnInternalTeamReturnsSelfOnly() {
        applicationProperties.getStorage().getSigning().setUserListScope("team");
        Team internalTeam = team(2L, TeamService.INTERNAL_TEAM_NAME);
        User caller = user(1L, "svc@saas.com", true, internalTeam);
        when(userService.findByUsernameIgnoreCase("svc@saas.com")).thenReturn(Optional.of(caller));
        authenticateAs("svc@saas.com");

        Response response = controller.listUsers();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        List<UserSummaryDTO> users = userList(response);
        assertEquals(1, users.size());
        assertEquals("svc@saas.com", users.get(0).getUsername());

        verify(userRepository, never()).findAllByTeamId(any());
        verify(userRepository, never()).findAll();
    }

    @Test
    void listUsersFailsClosedOnUnrecognisedScope() {
        // Any non-"org" value must restrict to the caller's team, not leak the instance.
        applicationProperties.getStorage().getSigning().setUserListScope("tewm");
        Team alpha = team(3L, "alpha");
        when(userService.findByUsernameIgnoreCase("caller@alpha.com"))
                .thenReturn(Optional.of(user(1L, "caller@alpha.com", true, alpha)));
        when(userRepository.findAllByTeamId(3L))
                .thenReturn(List.of(user(1L, "caller@alpha.com", true, alpha)));
        authenticateAs("caller@alpha.com");

        Response response = controller.listUsers();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());

        verify(userRepository).findAllByTeamId(3L);
        verify(userRepository, never()).findAll();
    }

    @Test
    void listUsersFailsClosedOnBlankScope() {
        applicationProperties.getStorage().getSigning().setUserListScope("   ");
        Team alpha = team(4L, "alpha");
        when(userService.findByUsernameIgnoreCase("caller@alpha.com"))
                .thenReturn(Optional.of(user(1L, "caller@alpha.com", true, alpha)));
        when(userRepository.findAllByTeamId(4L)).thenReturn(List.of());
        authenticateAs("caller@alpha.com");

        Response response = controller.listUsers();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());

        verify(userRepository).findAllByTeamId(4L);
        verify(userRepository, never()).findAll();
    }

    @Test
    void listUsersFailsClosedOnNullScope() {
        // A null value must also fail closed to the caller's team.
        applicationProperties.getStorage().getSigning().setUserListScope(null);
        Team alpha = team(9L, "alpha");
        when(userService.findByUsernameIgnoreCase("caller@alpha.com"))
                .thenReturn(Optional.of(user(1L, "caller@alpha.com", true, alpha)));
        when(userRepository.findAllByTeamId(9L)).thenReturn(List.of());
        authenticateAs("caller@alpha.com");

        Response response = controller.listUsers();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());

        verify(userRepository).findAllByTeamId(9L);
        verify(userRepository, never()).findAll();
    }

    @Test
    void listUsersOrgScopeIsCaseInsensitive() {
        applicationProperties.getStorage().getSigning().setUserListScope("ORG");
        when(userRepository.findAll()).thenReturn(queryOf(user(1L, "a@alpha.com", true, null)));
        authenticateAs("a@alpha.com");

        Response response = controller.listUsers();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());

        verify(userRepository).findAll();
        verify(userRepository, never()).findAllByTeamId(any());
    }

    @Test
    void listUsersRequiresAuthentication() {
        unauthenticated();

        Response response = controller.listUsers();

        assertEquals(Response.Status.UNAUTHORIZED.getStatusCode(), response.getStatus());

        verify(userRepository, never()).findAll();
        verify(userRepository, never()).findAllByTeamId(any());
    }

    @Test
    void signingUserListScopeDefaultsToOrg() {
        // Self-host backward-compat: default must stay "org" (saas profile flips it to "team").
        assertEquals(
                "org", new ApplicationProperties().getStorage().getSigning().getUserListScope());
    }
}
