package stirling.software.proprietary.security.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.api.user.UsernameAndPass;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;
import stirling.software.proprietary.service.UserLicenseSettingsService;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
class UserControllerTest {

    private final ObjectMapper objectMapper = JsonMapper.builder().build();

    @Mock private UserService userService;
    @Mock private SessionPersistentRegistry sessionRegistry;
    @Mock private TeamRepository teamRepository;
    @Mock private UserRepository userRepository;
    @Mock private EmailService emailService;
    @Mock private UserLicenseSettingsService licenseSettingsService;
    @Mock private LoginAttemptService loginAttemptService;

    private ApplicationProperties applicationProperties;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        applicationProperties.getPremium().setMaxUsers(10);
        applicationProperties.getMail().setEnabled(true);

        UserController controller =
                new UserController(
                        userService,
                        sessionRegistry,
                        applicationProperties,
                        teamRepository,
                        userRepository,
                        Optional.of(emailService),
                        licenseSettingsService,
                        loginAttemptService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    void registerRejectsExistingUser() throws Exception {
        UsernameAndPass payload = new UsernameAndPass();
        payload.setUsername("existing@example.com");
        payload.setPassword("pw");
        when(userService.usernameExistsIgnoreCase("existing@example.com")).thenReturn(true);

        mockMvc.perform(
                        post("/api/v1/user/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("User already exists"));

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

        mockMvc.perform(
                        post("/api/v1/user/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.user.username").value("new@example.com"));
    }

    @Test
    void changeUserEnabledPreventsSelfDisable() throws Exception {
        User user = new User();
        user.setUsername("admin");
        when(userService.usernameExistsIgnoreCase("admin")).thenReturn(true);
        when(userService.findByUsernameIgnoreCase("admin")).thenReturn(Optional.of(user));
        Authentication authentication = new UsernamePasswordAuthenticationToken("admin", "pw");

        mockMvc.perform(
                        post("/api/v1/user/admin/changeUserEnabled/admin")
                                .param("enabled", "false")
                                .principal(authentication))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Cannot disable your own account."));
    }

    @Test
    void changePasswordRejectsMissingUser() throws Exception {
        Authentication authentication = new UsernamePasswordAuthenticationToken("ghost", "pw");
        when(userService.usernameExistsIgnoreCase("ghost")).thenReturn(false);

        mockMvc.perform(post("/api/v1/user/admin/deleteUser/ghost").principal(authentication))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("User not found."));
    }

    @Test
    void unlockUserCallsResetAttemptsAndReturnsOk() throws Exception {
        mockMvc.perform(post("/api/v1/user/admin/unlockUser/lockeduser"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("User account unlocked successfully"));

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

    private static Authentication auth(String username) {
        return new UsernamePasswordAuthenticationToken(username, "pw");
    }

    @Test
    void listUsersDefaultScopeIsOrgWide() throws Exception {
        // Default "org" scope returns every enabled user via findAll(), no team lookup.
        Team alpha = team(1L, "alpha");
        when(userRepository.findAll())
                .thenReturn(
                        List.of(
                                user(1L, "a@alpha.com", true, alpha),
                                user(2L, "b@alpha.com", true, alpha)));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("a@alpha.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].username").value("a@alpha.com"))
                .andExpect(jsonPath("$[1].username").value("b@alpha.com"));

        // Caller is resolved (for the anonymous-gate) but org scope still uses findAll, not team.
        verify(userRepository, never()).findAllByTeamId(any());
    }

    @Test
    void listUsersForbiddenForAnonymousCaller() throws Exception {
        // Anonymous SaaS accounts must never enumerate users, regardless of scope.
        User anon = user(1L, "anon_abc", true, team(1L, TeamService.DEFAULT_TEAM_NAME));
        anon.setAuthenticationType(AuthenticationType.ANONYMOUS);
        when(userService.findByUsernameIgnoreCase("anon_abc")).thenReturn(Optional.of(anon));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("anon_abc")))
                .andExpect(status().isForbidden());

        verify(userRepository, never()).findAll();
        verify(userRepository, never()).findAllByTeamId(any());
    }

    @Test
    void listUsersOrgScopeFiltersDisabledUsers() throws Exception {
        Team alpha = team(1L, "alpha");
        when(userRepository.findAll())
                .thenReturn(
                        List.of(
                                user(1L, "enabled@alpha.com", true, alpha),
                                user(2L, "disabled@alpha.com", false, alpha)));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("enabled@alpha.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].username").value("enabled@alpha.com"));
    }

    @Test
    void listUsersTeamScopeReturnsOnlyCallerTeam() throws Exception {
        applicationProperties.getStorage().getSigning().setUserListScope("team");
        Team alpha = team(7L, "alpha");
        User caller = user(1L, "caller@alpha.com", true, alpha);
        when(userService.findByUsernameIgnoreCase("caller@alpha.com"))
                .thenReturn(Optional.of(caller));
        when(userRepository.findAllByTeamId(7L))
                .thenReturn(List.of(caller, user(2L, "mate@alpha.com", true, alpha)));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("caller@alpha.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].teamName").value("alpha"));

        verify(userRepository).findAllByTeamId(7L);
        verify(userRepository, never()).findAll();
    }

    @Test
    void listUsersTeamScopeWithMissingCallerReturnsEmpty() throws Exception {
        applicationProperties.getStorage().getSigning().setUserListScope("team");
        when(userService.findByUsernameIgnoreCase("ghost@alpha.com")).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/user/users").principal(auth("ghost@alpha.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        verify(userRepository, never()).findAllByTeamId(any());
        verify(userRepository, never()).findAll();
    }

    @Test
    void listUsersTeamScopeWithNullTeamReturnsSelfOnly() throws Exception {
        applicationProperties.getStorage().getSigning().setUserListScope("team");
        User caller = user(1L, "solo@nowhere.com", true, null);
        when(userService.findByUsernameIgnoreCase("solo@nowhere.com"))
                .thenReturn(Optional.of(caller));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("solo@nowhere.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].username").value("solo@nowhere.com"));

        verify(userRepository, never()).findAllByTeamId(any());
        verify(userRepository, never()).findAll();
    }

    @Test
    void listUsersTeamScopeOnDefaultTeamReturnsSelfOnly() throws Exception {
        // A caller on a shared system team must not enumerate its members.
        applicationProperties.getStorage().getSigning().setUserListScope("team");
        Team defaultTeam = team(1L, TeamService.DEFAULT_TEAM_NAME);
        User caller = user(1L, "new@saas.com", true, defaultTeam);
        when(userService.findByUsernameIgnoreCase("new@saas.com")).thenReturn(Optional.of(caller));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("new@saas.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].username").value("new@saas.com"));

        verify(userRepository, never()).findAllByTeamId(any());
        verify(userRepository, never()).findAll();
    }

    @Test
    void listUsersTeamScopeOnInternalTeamReturnsSelfOnly() throws Exception {
        applicationProperties.getStorage().getSigning().setUserListScope("team");
        Team internalTeam = team(2L, TeamService.INTERNAL_TEAM_NAME);
        User caller = user(1L, "svc@saas.com", true, internalTeam);
        when(userService.findByUsernameIgnoreCase("svc@saas.com")).thenReturn(Optional.of(caller));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("svc@saas.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].username").value("svc@saas.com"));

        verify(userRepository, never()).findAllByTeamId(any());
        verify(userRepository, never()).findAll();
    }

    @Test
    void listUsersFailsClosedOnUnrecognisedScope() throws Exception {
        // Any non-"org" value must restrict to the caller's team, not leak the instance.
        applicationProperties.getStorage().getSigning().setUserListScope("tewm");
        Team alpha = team(3L, "alpha");
        when(userService.findByUsernameIgnoreCase("caller@alpha.com"))
                .thenReturn(Optional.of(user(1L, "caller@alpha.com", true, alpha)));
        when(userRepository.findAllByTeamId(3L))
                .thenReturn(List.of(user(1L, "caller@alpha.com", true, alpha)));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("caller@alpha.com")))
                .andExpect(status().isOk());

        verify(userRepository).findAllByTeamId(3L);
        verify(userRepository, never()).findAll();
    }

    @Test
    void listUsersFailsClosedOnBlankScope() throws Exception {
        applicationProperties.getStorage().getSigning().setUserListScope("   ");
        Team alpha = team(4L, "alpha");
        when(userService.findByUsernameIgnoreCase("caller@alpha.com"))
                .thenReturn(Optional.of(user(1L, "caller@alpha.com", true, alpha)));
        when(userRepository.findAllByTeamId(4L)).thenReturn(List.of());

        mockMvc.perform(get("/api/v1/user/users").principal(auth("caller@alpha.com")))
                .andExpect(status().isOk());

        verify(userRepository).findAllByTeamId(4L);
        verify(userRepository, never()).findAll();
    }

    @Test
    void listUsersFailsClosedOnNullScope() throws Exception {
        // A null value must also fail closed to the caller's team.
        applicationProperties.getStorage().getSigning().setUserListScope(null);
        Team alpha = team(9L, "alpha");
        when(userService.findByUsernameIgnoreCase("caller@alpha.com"))
                .thenReturn(Optional.of(user(1L, "caller@alpha.com", true, alpha)));
        when(userRepository.findAllByTeamId(9L)).thenReturn(List.of());

        mockMvc.perform(get("/api/v1/user/users").principal(auth("caller@alpha.com")))
                .andExpect(status().isOk());

        verify(userRepository).findAllByTeamId(9L);
        verify(userRepository, never()).findAll();
    }

    @Test
    void listUsersOrgScopeIsCaseInsensitive() throws Exception {
        applicationProperties.getStorage().getSigning().setUserListScope("ORG");
        when(userRepository.findAll()).thenReturn(List.of(user(1L, "a@alpha.com", true, null)));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("a@alpha.com")))
                .andExpect(status().isOk());

        verify(userRepository).findAll();
        verify(userRepository, never()).findAllByTeamId(any());
    }

    @Test
    void listUsersRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/user/users")).andExpect(status().isUnauthorized());

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
