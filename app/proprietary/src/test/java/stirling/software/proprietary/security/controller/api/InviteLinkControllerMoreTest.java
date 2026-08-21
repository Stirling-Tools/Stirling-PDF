package stirling.software.proprietary.security.controller.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.Principal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.security.model.InviteToken;
import stirling.software.proprietary.security.repository.InviteTokenRepository;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

@ExtendWith(MockitoExtension.class)
@DisplayName("InviteLinkController - additional coverage")
class InviteLinkControllerMoreTest {

    @Mock private InviteTokenRepository inviteTokenRepository;
    @Mock private TeamRepository teamRepository;
    @Mock private UserService userService;
    @Mock private EmailService emailService;
    @Mock private UserLicenseSettingsService userLicenseSettingsService;

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
                        Optional.of(emailService),
                        userLicenseSettingsService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    private static InviteToken validInvite(String token) {
        InviteToken invite = new InviteToken();
        invite.setToken(token);
        invite.setExpiresAt(LocalDateTime.now().plusHours(2));
        invite.setRole(Role.USER.getRoleId());
        invite.setUsed(false);
        return invite;
    }

    @Nested
    @DisplayName("generate")
    class Generate {

        @Test
        @DisplayName("rejects sendEmail without an email address")
        void sendEmailWithoutAddress() throws Exception {
            mockMvc.perform(
                            post("/api/v1/invite/generate")
                                    .principal(adminPrincipal)
                                    .param("sendEmail", "true"))
                    .andExpect(status().isBadRequest())
                    .andExpect(
                            jsonPath("$.error")
                                    .value("Cannot send email without an email address"));
        }

        @Test
        @DisplayName("returns conflict when the user already exists")
        void userAlreadyExists() throws Exception {
            when(userService.usernameExistsIgnoreCase("dup@ex.com")).thenReturn(true);

            mockMvc.perform(
                            post("/api/v1/invite/generate")
                                    .principal(adminPrincipal)
                                    .param("email", "dup@ex.com"))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error").value("User already exists"));
        }

        @Test
        @DisplayName("returns conflict when an active invite already exists")
        void activeInviteExists() throws Exception {
            when(userService.usernameExistsIgnoreCase("dup@ex.com")).thenReturn(false);
            when(inviteTokenRepository.findByEmail("dup@ex.com"))
                    .thenReturn(Optional.of(validInvite("existing")));

            mockMvc.perform(
                            post("/api/v1/invite/generate")
                                    .principal(adminPrincipal)
                                    .param("email", "dup@ex.com"))
                    .andExpect(status().isConflict())
                    .andExpect(
                            jsonPath("$.error")
                                    .value(
                                            "An active invite already exists for this email"
                                                    + " address"));
        }

        @Test
        @DisplayName("rejects assigning the INTERNAL_API_USER role")
        void rejectsInternalApiRole() throws Exception {
            mockMvc.perform(
                            post("/api/v1/invite/generate")
                                    .principal(adminPrincipal)
                                    .param("role", Role.INTERNAL_API_USER.getRoleId()))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Cannot assign INTERNAL_API_USER role"));
        }
    }

    @Nested
    @DisplayName("list")
    class ListInvites {

        @Test
        @DisplayName("returns the active invites with their metadata")
        void listsActiveInvites() throws Exception {
            InviteToken invite = validInvite("t1");
            invite.setId(11L);
            invite.setEmail("a@ex.com");
            invite.setCreatedBy("admin");
            invite.setCreatedAt(LocalDateTime.now());
            when(inviteTokenRepository.findByUsedFalseAndExpiresAtAfter(any(LocalDateTime.class)))
                    .thenReturn(List.of(invite));

            mockMvc.perform(get("/api/v1/invite/list"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.invites[0].id").value(11))
                    .andExpect(jsonPath("$.invites[0].email").value("a@ex.com"));
        }
    }

    @Nested
    @DisplayName("revoke")
    class Revoke {

        @Test
        @DisplayName("returns 404 when the invite does not exist")
        void notFound() throws Exception {
            when(inviteTokenRepository.findById(99L)).thenReturn(Optional.empty());

            mockMvc.perform(delete("/api/v1/invite/revoke/99"))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error").value("Invite not found"));

            verify(inviteTokenRepository, never()).deleteById(any());
        }

        @Test
        @DisplayName("deletes the invite when present")
        void deletesInvite() throws Exception {
            when(inviteTokenRepository.findById(5L)).thenReturn(Optional.of(validInvite("t")));

            mockMvc.perform(delete("/api/v1/invite/revoke/5"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.message").value("Invite link revoked successfully"));

            verify(inviteTokenRepository).deleteById(5L);
        }
    }

    @Nested
    @DisplayName("cleanup")
    class Cleanup {

        @Test
        @DisplayName("deletes only the expired or used invites")
        void deletesExpiredInvites() throws Exception {
            InviteToken expired = new InviteToken();
            expired.setExpiresAt(LocalDateTime.now().minusHours(1));
            InviteToken active = validInvite("active");
            when(inviteTokenRepository.findAll()).thenReturn(List.of(expired, active));

            mockMvc.perform(post("/api/v1/invite/cleanup"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.deletedCount").value(1));

            verify(inviteTokenRepository).deleteAll(List.of(expired));
        }
    }

    @Nested
    @DisplayName("validate")
    class Validate {

        @Test
        @DisplayName("returns details for a valid token")
        void validToken() throws Exception {
            InviteToken invite = validInvite("good");
            invite.setEmail("a@ex.com");
            when(inviteTokenRepository.findByToken("good")).thenReturn(Optional.of(invite));
            when(userService.usernameExistsIgnoreCase("a@ex.com")).thenReturn(false);

            mockMvc.perform(get("/api/v1/invite/validate/good"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.email").value("a@ex.com"))
                    .andExpect(jsonPath("$.emailRequired").value(false));
        }

        @Test
        @DisplayName("returns 404 for an already-used token")
        void usedToken() throws Exception {
            InviteToken invite = validInvite("used");
            invite.setUsed(true);
            when(inviteTokenRepository.findByToken("used")).thenReturn(Optional.of(invite));

            mockMvc.perform(get("/api/v1/invite/validate/used"))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error").value("Invalid invite link"));
        }

        @Test
        @DisplayName("returns 404 when the pre-set email already has an account")
        void emailAlreadyExists() throws Exception {
            InviteToken invite = validInvite("dup");
            invite.setEmail("taken@ex.com");
            when(inviteTokenRepository.findByToken("dup")).thenReturn(Optional.of(invite));
            when(userService.usernameExistsIgnoreCase("taken@ex.com")).thenReturn(true);

            mockMvc.perform(get("/api/v1/invite/validate/dup")).andExpect(status().isNotFound());
        }
    }

    @Nested
    @DisplayName("accept")
    class Accept {

        @Test
        @DisplayName("rejects a missing password")
        void missingPassword() throws Exception {
            mockMvc.perform(post("/api/v1/invite/accept/tok").param("password", ""))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Password is required"));
        }

        @Test
        @DisplayName("returns 404 for an expired token")
        void expiredToken() throws Exception {
            InviteToken invite = validInvite("exp");
            invite.setExpiresAt(LocalDateTime.now().minusHours(1));
            when(inviteTokenRepository.findByToken("exp")).thenReturn(Optional.of(invite));

            mockMvc.perform(post("/api/v1/invite/accept/exp").param("password", "secret123"))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error").value("Invalid invite link"));
        }

        @Test
        @DisplayName("requires an email when the invite has none")
        void emailRequired() throws Exception {
            InviteToken invite = validInvite("noemail");
            invite.setEmail(null);
            when(inviteTokenRepository.findByToken("noemail")).thenReturn(Optional.of(invite));

            mockMvc.perform(post("/api/v1/invite/accept/noemail").param("password", "secret123"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Email address is required"));
        }

        @Test
        @DisplayName("creates the account using the pre-set email")
        void createsWithPresetEmail() throws Exception {
            InviteToken invite = validInvite("preset");
            invite.setEmail("preset@ex.com");
            invite.setTeamId(3L);
            when(inviteTokenRepository.findByToken("preset")).thenReturn(Optional.of(invite));
            when(userService.usernameExistsIgnoreCase("preset@ex.com")).thenReturn(false);

            mockMvc.perform(post("/api/v1/invite/accept/preset").param("password", "secret123"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.username").value("preset@ex.com"));

            verify(userService).saveUserCore(any());
            verify(inviteTokenRepository).save(invite);
        }
    }
}
