package stirling.software.proprietary.security.controller.api;

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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.api.security.UserSummaryDTO;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.LoginLandingView;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.api.user.UpdateLoginLandingView;
import stirling.software.proprietary.security.model.api.user.UsernameAndPass;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.LoginLandingService;
import stirling.software.proprietary.security.service.TeamMembershipService;
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
    @Mock private TeamMembershipService teamMembershipService;
    @Mock private LoginLandingService loginLandingService;

    private ApplicationProperties applicationProperties;
    private MockEnvironment environment;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        environment = new MockEnvironment();
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
                        loginAttemptService,
                        teamMembershipService,
                        org.mockito.Mockito.mock(
                                stirling.software.proprietary.service.OrgOwnerService.class),
                        loginLandingService,
                        environment);
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
        when(teamRepository.findFirstByNameOrderByIdAsc(TeamService.DEFAULT_TEAM_NAME))
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
    void updateLoginLandingViewStoresTheOptIn() throws Exception {
        UpdateLoginLandingView payload = new UpdateLoginLandingView();
        payload.setLoginLandingView("processor");
        Authentication authentication = new UsernamePasswordAuthenticationToken("lead", "pw");

        mockMvc.perform(
                        post("/api/v1/user/login-landing-view")
                                .principal(authentication)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.loginLandingView").value("processor"));

        verify(loginLandingService).setLandingView("lead", LoginLandingView.PROCESSOR);
    }

    @Test
    void updateLoginLandingViewRejectsAnUnknownView() throws Exception {
        UpdateLoginLandingView payload = new UpdateLoginLandingView();
        payload.setLoginLandingView("portal");
        Authentication authentication = new UsernamePasswordAuthenticationToken("lead", "pw");

        mockMvc.perform(
                        post("/api/v1/user/login-landing-view")
                                .principal(authentication)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isBadRequest());

        verify(loginLandingService, never()).setLandingView(any(), any());
    }

    @Test
    void unlockUserCallsResetAttemptsAndReturnsOk() throws Exception {
        mockMvc.perform(post("/api/v1/user/admin/unlockUser/lockeduser"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("User account unlocked successfully"));

        verify(loginAttemptService).resetAttempts("lockeduser");
    }

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

    private static UserSummaryDTO summary(long id, String username, String teamName) {
        return new UserSummaryDTO(id, username, username, teamName, true);
    }

    @ParameterizedTest
    @ValueSource(strings = {"org", "team", "invalid"})
    void listUsersSelfHostedIsInstanceWideRegardlessOfLegacySetting(String legacyScope)
            throws Exception {
        environment.setActiveProfiles("security");
        environment.withProperty("storage.signing.userListScope", legacyScope);
        Team alpha = team(1L, "alpha");
        when(userService.findByUsernameIgnoreCase("a@alpha.com"))
                .thenReturn(Optional.of(user(1L, "a@alpha.com", true, alpha)));
        when(userRepository.findEnabledSigningUsers())
                .thenReturn(
                        List.of(
                                summary(1L, "a@alpha.com", "alpha"),
                                summary(2L, "b@beta.com", "beta")));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("a@alpha.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].username").value("a@alpha.com"))
                .andExpect(jsonPath("$[1].username").value("b@beta.com"));

        verify(userRepository, never()).findEnabledSigningUsersByTeamId(any());
    }

    @Test
    void listUsersForbiddenForAnonymousCaller() throws Exception {
        // Anonymous SaaS accounts must never enumerate users, regardless of scope.
        User anon = user(1L, "anon_abc", true, team(1L, TeamService.DEFAULT_TEAM_NAME));
        anon.setAuthenticationType(AuthenticationType.ANONYMOUS);
        when(userService.findByUsernameIgnoreCase("anon_abc")).thenReturn(Optional.of(anon));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("anon_abc")))
                .andExpect(status().isForbidden());

        verify(userRepository, never()).findEnabledSigningUsers();
        verify(userRepository, never()).findEnabledSigningUsersByTeamId(any());
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"org", "ORG", " org ", "team", "invalid"})
    void listUsersSaasAlwaysUsesTeamScope(String configuredScope) throws Exception {
        environment.setActiveProfiles("saas");
        if (configuredScope != null) {
            environment.withProperty("storage.signing.userListScope", configuredScope);
        }
        Team alpha = team(1L, "alpha");
        when(userService.findByUsernameIgnoreCase("enabled@alpha.com"))
                .thenReturn(Optional.of(user(1L, "enabled@alpha.com", true, alpha)));
        when(userRepository.findEnabledSigningUsersByTeamId(1L))
                .thenReturn(List.of(summary(1L, "enabled@alpha.com", "alpha")));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("enabled@alpha.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].username").value("enabled@alpha.com"));

        verify(userRepository, never()).findEnabledSigningUsers();
    }

    @Test
    void listUsersTeamScopeReturnsOnlyCallerTeam() throws Exception {
        environment.setActiveProfiles("saas");
        Team alpha = team(7L, "alpha");
        User caller = user(1L, "caller@alpha.com", true, alpha);
        when(userService.findByUsernameIgnoreCase("caller@alpha.com"))
                .thenReturn(Optional.of(caller));
        when(userRepository.findEnabledSigningUsersByTeamId(7L))
                .thenReturn(
                        List.of(
                                summary(1L, "caller@alpha.com", "alpha"),
                                summary(2L, "mate@alpha.com", "alpha")));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("caller@alpha.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].teamName").value("alpha"));

        verify(userRepository).findEnabledSigningUsersByTeamId(7L);
        verify(userRepository, never()).findEnabledSigningUsers();
    }

    @Test
    void listUsersTeamScopeWithMissingCallerReturnsEmpty() throws Exception {
        environment.setActiveProfiles("saas");
        when(userService.findByUsernameIgnoreCase("ghost@alpha.com")).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/user/users").principal(auth("ghost@alpha.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        verify(userRepository, never()).findEnabledSigningUsersByTeamId(any());
        verify(userRepository, never()).findEnabledSigningUsers();
    }

    @Test
    void listUsersOrgScopeWithMissingCallerReturnsEmpty() throws Exception {
        mockMvc.perform(get("/api/v1/user/users").principal(auth("missing")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        verify(userRepository, never()).findEnabledSigningUsers();
        verify(userRepository, never()).findEnabledSigningUsersByTeamId(any());
    }

    @Test
    void listUsersDisabledCallerCannotEnumerateUsers() throws Exception {
        when(userService.findByUsernameIgnoreCase("disabled"))
                .thenReturn(Optional.of(user(1L, "disabled", false, null)));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("disabled")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        verify(userRepository, never()).findEnabledSigningUsers();
        verify(userRepository, never()).findEnabledSigningUsersByTeamId(any());
    }

    @Test
    void listUsersTeamScopeWithNullTeamReturnsSelfOnly() throws Exception {
        environment.setActiveProfiles("saas");
        User caller = user(1L, "solo@nowhere.com", true, null);
        when(userService.findByUsernameIgnoreCase("solo@nowhere.com"))
                .thenReturn(Optional.of(caller));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("solo@nowhere.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].username").value("solo@nowhere.com"));

        verify(userRepository, never()).findEnabledSigningUsersByTeamId(any());
        verify(userRepository, never()).findEnabledSigningUsers();
    }

    @Test
    void listUsersTeamScopeOnDefaultTeamReturnsSelfOnly() throws Exception {
        // A caller on a shared system team must not enumerate its members.
        environment.setActiveProfiles("saas");
        Team defaultTeam = team(1L, TeamService.DEFAULT_TEAM_NAME);
        User caller = user(1L, "new@saas.com", true, defaultTeam);
        when(userService.findByUsernameIgnoreCase("new@saas.com")).thenReturn(Optional.of(caller));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("new@saas.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].username").value("new@saas.com"));

        verify(userRepository, never()).findEnabledSigningUsersByTeamId(any());
        verify(userRepository, never()).findEnabledSigningUsers();
    }

    @Test
    void listUsersTeamScopeOnInternalTeamReturnsSelfOnly() throws Exception {
        environment.setActiveProfiles("saas");
        Team internalTeam = team(2L, TeamService.INTERNAL_TEAM_NAME);
        User caller = user(1L, "svc@saas.com", true, internalTeam);
        when(userService.findByUsernameIgnoreCase("svc@saas.com")).thenReturn(Optional.of(caller));

        mockMvc.perform(get("/api/v1/user/users").principal(auth("svc@saas.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].username").value("svc@saas.com"));

        verify(userRepository, never()).findEnabledSigningUsersByTeamId(any());
        verify(userRepository, never()).findEnabledSigningUsers();
    }

    @Test
    void listUsersRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/user/users")).andExpect(status().isUnauthorized());

        verify(userRepository, never()).findEnabledSigningUsers();
        verify(userRepository, never()).findEnabledSigningUsersByTeamId(any());
    }
}
