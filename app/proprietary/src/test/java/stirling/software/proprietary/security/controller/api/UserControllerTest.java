package stirling.software.proprietary.security.controller.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

import com.fasterxml.jackson.databind.ObjectMapper;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.api.user.UsernameAndPass;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;
import stirling.software.proprietary.service.UserLicenseSettingsService;

@ExtendWith(MockitoExtension.class)
class UserControllerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock private UserService userService;
    @Mock private SessionPersistentRegistry sessionRegistry;
    @Mock private TeamRepository teamRepository;
    @Mock private UserRepository userRepository;
    @Mock private EmailService emailService;
    @Mock private UserLicenseSettingsService licenseSettingsService;

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
                        licenseSettingsService);
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
}
