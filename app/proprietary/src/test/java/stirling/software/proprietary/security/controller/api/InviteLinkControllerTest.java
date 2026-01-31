package stirling.software.proprietary.security.controller.api;

import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.Principal;
import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.InviteToken;
import stirling.software.proprietary.security.repository.InviteTokenRepository;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;

@ExtendWith(MockitoExtension.class)
class InviteLinkControllerTest {

    @Mock private InviteTokenRepository inviteTokenRepository;
    @Mock private TeamRepository teamRepository;
    @Mock private UserService userService;
    @Mock private EmailService emailService;

    private ApplicationProperties applicationProperties;
    private MockMvc mockMvc;
    private Principal adminPrincipal;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        applicationProperties.getMail().setEnableInvites(true);
        applicationProperties.getMail().setInviteLinkExpiryHours(24);
        applicationProperties.getSystem().setFrontendUrl("https://frontend.example.com");

        adminPrincipal = () -> "admin";

        InviteLinkController controller =
                new InviteLinkController(
                        inviteTokenRepository,
                        teamRepository,
                        userService,
                        applicationProperties,
                        Optional.of(emailService));
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    void generateInviteLinkRejectsWhenInvitesDisabled() throws Exception {
        applicationProperties.getMail().setEnableInvites(false);

        mockMvc.perform(post("/api/v1/invite/generate").principal(adminPrincipal))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Email invites are not enabled"));

        verify(inviteTokenRepository, never()).save(any());
    }

    @Test
    void generateInviteLinkRejectsInvalidEmail() throws Exception {
        applicationProperties.getMail().setEnableInvites(true);

        mockMvc.perform(
                        post("/api/v1/invite/generate")
                                .principal(adminPrincipal)
                                .param("email", "not-an-email"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Invalid email address"));
    }

    @Test
    void generateInviteLinkBlocksOnLicenseLimit() throws Exception {
        applicationProperties.getPremium().setEnabled(true);
        applicationProperties.getPremium().setMaxUsers(1);
        when(userService.getTotalUsersCount()).thenReturn(1L);
        when(inviteTokenRepository.countActiveInvites(any(LocalDateTime.class))).thenReturn(0L);

        mockMvc.perform(
                        post("/api/v1/invite/generate")
                                .principal(adminPrincipal)
                                .param("email", "new@ex.com"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(startsWith("License limit reached")));
    }

    @Test
    void generateInviteLinkBuildsFrontendUrl() throws Exception {
        Team defaultTeam = new Team();
        defaultTeam.setId(5L);
        defaultTeam.setName(TeamService.DEFAULT_TEAM_NAME);
        when(teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME))
                .thenReturn(Optional.of(defaultTeam));
        when(userService.usernameExistsIgnoreCase("new@example.com")).thenReturn(false);
        when(inviteTokenRepository.findByEmail("new@example.com")).thenReturn(Optional.empty());

        mockMvc.perform(
                        post("/api/v1/invite/generate")
                                .principal(adminPrincipal)
                                .param("email", "new@example.com"))
                .andExpect(status().isOk())
                .andExpect(
                        jsonPath("$.inviteUrl")
                                .value(startsWith("https://frontend.example.com/invite?token=")))
                .andExpect(jsonPath("$.email").value("new@example.com"));

        verify(inviteTokenRepository).save(any());
    }

    @Test
    void validateInviteTokenReturnsGoneWhenExpired() throws Exception {
        InviteToken expired = new InviteToken();
        expired.setToken("abc");
        expired.setExpiresAt(LocalDateTime.now().minusHours(1));
        expired.setRole(Role.USER.getRoleId());
        when(inviteTokenRepository.findByToken("abc")).thenReturn(Optional.of(expired));

        mockMvc.perform(get("/api/v1/invite/validate/abc"))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.error").value("This invite link has expired"));
    }

    @Test
    void acceptInviteCreatesUserWhenEmailProvided() throws Exception {
        InviteToken invite = new InviteToken();
        invite.setToken("abc");
        invite.setExpiresAt(LocalDateTime.now().plusHours(2));
        invite.setRole(Role.USER.getRoleId());
        invite.setUsed(false);
        invite.setEmail(null); // email required from request
        when(inviteTokenRepository.findByToken("abc")).thenReturn(Optional.of(invite));
        when(userService.usernameExistsIgnoreCase("new@example.com")).thenReturn(false);

        mockMvc.perform(
                        post("/api/v1/invite/accept/abc")
                                .param("email", "new@example.com")
                                .param("password", "password123"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Account created successfully"))
                .andExpect(jsonPath("$.username").value("new@example.com"));

        verify(userService).saveUserCore(any());
        verify(inviteTokenRepository).save(invite);
    }
}
