package stirling.software.proprietary.security.controller.api;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import jakarta.mail.MessagingException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.LoginLandingService;
import stirling.software.proprietary.security.service.SaveUserRequest;
import stirling.software.proprietary.security.service.TeamMembershipService;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;
import stirling.software.proprietary.service.UserLicenseSettingsService;

@ExtendWith(MockitoExtension.class)
@DisplayName("UserController - additional coverage")
class UserControllerMoreTest {

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
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
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
                        loginLandingService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    private static Authentication auth(String username) {
        return new UsernamePasswordAuthenticationToken(username, "pw");
    }

    private static User user(String username) {
        User u = new User();
        u.setUsername(username);
        return u;
    }

    private static void markInvitePending(User u) {
        u.getSettings().put(UserService.INVITE_PENDING_KEY, "true");
    }

    @Nested
    @DisplayName("change-password")
    class ChangePassword {

        @Test
        @DisplayName("returns 404 when the principal has no user record")
        void userNotFound() throws Exception {
            when(userService.findByUsernameIgnoreCase("me")).thenReturn(Optional.empty());

            mockMvc.perform(
                            post("/api/v1/user/change-password")
                                    .principal(auth("me"))
                                    .param("currentPassword", "old")
                                    .param("newPassword", "new"))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error").value("userNotFound"));
        }

        @Test
        @DisplayName("returns 401 when the current password is wrong")
        void incorrectPassword() throws Exception {
            User u = user("me");
            when(userService.findByUsernameIgnoreCase("me")).thenReturn(Optional.of(u));
            when(userService.isPasswordCorrect(u, "old")).thenReturn(false);

            mockMvc.perform(
                            post("/api/v1/user/change-password")
                                    .principal(auth("me"))
                                    .param("currentPassword", "old")
                                    .param("newPassword", "new"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error").value("incorrectPassword"));
        }

        @Test
        @DisplayName("changes the password and logs the user out")
        void success() throws Exception {
            User u = user("me");
            when(userService.findByUsernameIgnoreCase("me")).thenReturn(Optional.of(u));
            when(userService.isPasswordCorrect(u, "old")).thenReturn(true);

            mockMvc.perform(
                            post("/api/v1/user/change-password")
                                    .principal(auth("me"))
                                    .param("currentPassword", "old")
                                    .param("newPassword", "new"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.message").value("credsUpdated"));

            verify(userService).changePassword(u, "new");
        }
    }

    @Nested
    @DisplayName("change-password-on-login")
    class ChangePasswordOnLogin {

        @Test
        @DisplayName("rejects mismatched confirmation")
        void mismatch() throws Exception {
            User u = user("me");
            when(userService.findByUsernameIgnoreCase("me")).thenReturn(Optional.of(u));

            mockMvc.perform(
                            post("/api/v1/user/change-password-on-login")
                                    .principal(auth("me"))
                                    .param("currentPassword", "old")
                                    .param("newPassword", "a")
                                    .param("confirmPassword", "b"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("passwordMismatch"));
        }

        @Test
        @DisplayName("rejects an unchanged password")
        void unchanged() throws Exception {
            User u = user("me");
            when(userService.findByUsernameIgnoreCase("me")).thenReturn(Optional.of(u));

            mockMvc.perform(
                            post("/api/v1/user/change-password-on-login")
                                    .principal(auth("me"))
                                    .param("currentPassword", "same")
                                    .param("newPassword", "same")
                                    .param("confirmPassword", "same"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("passwordUnchanged"));
        }

        @Test
        @DisplayName("changes the password and clears the force-change flag")
        void success() throws Exception {
            User u = user("me");
            u.setForcePasswordChange(true);
            when(userService.findByUsernameIgnoreCase("me")).thenReturn(Optional.of(u));
            when(userService.isPasswordCorrect(u, "old")).thenReturn(true);

            mockMvc.perform(
                            post("/api/v1/user/change-password-on-login")
                                    .principal(auth("me"))
                                    .param("currentPassword", "old")
                                    .param("newPassword", "new")
                                    .param("confirmPassword", "new"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.message").value("credsUpdated"));

            verify(userService).changePassword(u, "new");
            verify(userService).changeFirstUse(u, false);
        }

        @Test
        @DisplayName("retires the invite marker, so the invitation can no longer be re-issued")
        void clearsInvitePending() throws Exception {
            User u = user("me");
            markInvitePending(u);
            when(userService.findByUsernameIgnoreCase("me")).thenReturn(Optional.of(u));
            when(userService.isPasswordCorrect(u, "old")).thenReturn(true);

            mockMvc.perform(
                            post("/api/v1/user/change-password-on-login")
                                    .principal(auth("me"))
                                    .param("currentPassword", "old")
                                    .param("newPassword", "new")
                                    .param("confirmPassword", "new"))
                    .andExpect(status().isOk());

            InOrder order = inOrder(userService);
            order.verify(userService).changePassword(u, "new");
            // After the saves: clearInvitePending deletes the row behind Hibernate's back, so a
            // later save of the same user would write the stale collection straight back.
            order.verify(userService).clearInvitePending(u);
        }
    }

    @Nested
    @DisplayName("admin/saveUser")
    class SaveUser {

        @Test
        @DisplayName("rejects an invalid username format")
        void invalidUsername() throws Exception {
            when(userService.isUsernameValid("x")).thenReturn(false);

            mockMvc.perform(
                            post("/api/v1/user/admin/saveUser")
                                    .param("username", "x")
                                    .param("role", "ROLE_USER")
                                    .param("authType", "web"))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("rejects an unknown role")
        void invalidRole() throws Exception {
            when(userService.isUsernameValid("new@ex.com")).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(userService.findByUsernameIgnoreCase("new@ex.com")).thenReturn(Optional.empty());
            when(userService.usernameExistsIgnoreCase("new@ex.com")).thenReturn(false);

            mockMvc.perform(
                            post("/api/v1/user/admin/saveUser")
                                    .param("username", "new@ex.com")
                                    .param("role", "ROLE_BOGUS")
                                    .param("authType", "web"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Invalid role specified."));
        }

        @Test
        @DisplayName("requires a password for WEB auth")
        void missingPassword() throws Exception {
            when(userService.isUsernameValid("new@ex.com")).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(userService.findByUsernameIgnoreCase("new@ex.com")).thenReturn(Optional.empty());
            when(userService.usernameExistsIgnoreCase("new@ex.com")).thenReturn(false);

            mockMvc.perform(
                            post("/api/v1/user/admin/saveUser")
                                    .param("username", "new@ex.com")
                                    .param("role", "ROLE_USER")
                                    .param("authType", "web"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Password is required."));
        }

        @Test
        @DisplayName("creates a WEB user with a default team")
        void success() throws Exception {
            when(userService.isUsernameValid("new@ex.com")).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(userService.findByUsernameIgnoreCase("new@ex.com")).thenReturn(Optional.empty());
            when(userService.usernameExistsIgnoreCase("new@ex.com")).thenReturn(false);
            Team defaultTeam = new Team();
            defaultTeam.setId(1L);
            defaultTeam.setName(TeamService.DEFAULT_TEAM_NAME);
            when(teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME))
                    .thenReturn(Optional.of(defaultTeam));

            mockMvc.perform(
                            post("/api/v1/user/admin/saveUser")
                                    .param("username", "new@ex.com")
                                    .param("password", "secret1")
                                    .param("role", "ROLE_USER")
                                    .param("authType", "web"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.message").value("User created successfully"));

            verify(userService).saveUserCore(any());
        }
    }

    @Nested
    @DisplayName("admin/changeRole")
    class ChangeRole {

        @Test
        @DisplayName("returns 404 when the target user is missing")
        void userNotFound() throws Exception {
            when(userService.findByUsernameIgnoreCase("ghost")).thenReturn(Optional.empty());

            mockMvc.perform(
                            post("/api/v1/user/admin/changeRole")
                                    .principal(auth("admin"))
                                    .param("username", "ghost")
                                    .param("role", "ROLE_USER"))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("prevents an admin from changing their own role")
        void cannotChangeOwnRole() throws Exception {
            when(userService.findByUsernameIgnoreCase("admin"))
                    .thenReturn(Optional.of(user("admin")));
            when(userService.usernameExistsIgnoreCase("admin")).thenReturn(true);

            mockMvc.perform(
                            post("/api/v1/user/admin/changeRole")
                                    .principal(auth("admin"))
                                    .param("username", "admin")
                                    .param("role", "ROLE_ADMIN"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Cannot change your own role."));
        }

        @Test
        @DisplayName("updates the role for another user")
        void success() throws Exception {
            User target = user("bob");
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(target));
            when(userService.usernameExistsIgnoreCase("bob")).thenReturn(true);

            mockMvc.perform(
                            post("/api/v1/user/admin/changeRole")
                                    .principal(auth("admin"))
                                    .param("username", "bob")
                                    .param("role", "ROLE_ADMIN"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.message").value("User role updated successfully"));

            verify(userService).changeRole(target, "ROLE_ADMIN");
        }
    }

    @Nested
    @DisplayName("admin/changePasswordForUser")
    class ChangePasswordForUser {

        @Test
        @DisplayName("prevents changing your own password via the admin route")
        void cannotChangeOwn() throws Exception {
            when(userService.findByUsernameIgnoreCase("admin"))
                    .thenReturn(Optional.of(user("admin")));

            mockMvc.perform(
                            post("/api/v1/user/admin/changePasswordForUser")
                                    .principal(auth("admin"))
                                    .param("username", "admin")
                                    .param("newPassword", "x"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Cannot change your own password."));
        }

        @Test
        @DisplayName("requires a non-blank password")
        void requiresPassword() throws Exception {
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(user("bob")));

            mockMvc.perform(
                            post("/api/v1/user/admin/changePasswordForUser")
                                    .principal(auth("admin"))
                                    .param("username", "bob"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("New password is required."));
        }

        @Test
        @DisplayName("changes the password and invalidates sessions")
        void success() throws Exception {
            User target = user("bob");
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(target));

            mockMvc.perform(
                            post("/api/v1/user/admin/changePasswordForUser")
                                    .principal(auth("admin"))
                                    .param("username", "bob")
                                    .param("newPassword", "newpass"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.message").value("User password updated successfully"));

            verify(userService).changePassword(target, "newpass");
            verify(userService).invalidateUserSessions("bob");
        }
    }

    @Nested
    @DisplayName("API key endpoints")
    class ApiKeyEndpoints {

        @Test
        @DisplayName("get-api-key returns 403 without a principal")
        void getApiKeyNoPrincipal() throws Exception {
            mockMvc.perform(post("/api/v1/user/get-api-key")).andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("get-api-key returns the key for the caller")
        void getApiKeySuccess() throws Exception {
            when(userService.getApiKeyForUser("me")).thenReturn("api-123");

            mockMvc.perform(post("/api/v1/user/get-api-key").principal(auth("me")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.apiKey").value("api-123"));
        }

        @Test
        @DisplayName("update-api-key refreshes and returns the new key")
        void updateApiKeySuccess() throws Exception {
            User refreshed = user("me");
            refreshed.setApiKey("fresh");
            when(userService.refreshApiKeyForUser("me")).thenReturn(refreshed);

            mockMvc.perform(post("/api/v1/user/update-api-key").principal(auth("me")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.apiKey").value("fresh"));
        }
    }

    @Nested
    @DisplayName("admin/deleteUser")
    class DeleteUser {

        @Test
        @DisplayName("deletes another user and expires their sessions")
        void success() throws Exception {
            when(userService.usernameExistsIgnoreCase("bob")).thenReturn(true);
            when(sessionRegistry.getAllSessions("bob", false)).thenReturn(java.util.List.of());

            mockMvc.perform(post("/api/v1/user/admin/deleteUser/bob").principal(auth("admin")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.message").value("User deleted successfully"));

            verify(userService).deleteUser("bob");
        }

        @Test
        @DisplayName("prevents deleting your own account")
        void cannotDeleteSelf() throws Exception {
            when(userService.usernameExistsIgnoreCase("admin")).thenReturn(true);

            mockMvc.perform(post("/api/v1/user/admin/deleteUser/admin").principal(auth("admin")))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Cannot delete your own account."));

            verify(userService, never()).deleteUser(eq("admin"));
        }
    }

    @Nested
    @DisplayName("admin/inviteUsers")
    class InviteUsers {

        @Test
        @DisplayName("rejects when invites are disabled")
        void invitesDisabled() throws Exception {
            applicationProperties.getMail().setEnableInvites(false);

            mockMvc.perform(
                            post("/api/v1/user/admin/inviteUsers")
                                    .principal(auth("admin"))
                                    .param("emails", "a@ex.com"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Email invites are not enabled"));
        }

        @Test
        @DisplayName("invites a new user and reports a success count")
        void success() throws Exception {
            applicationProperties.getMail().setEnableInvites(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(userService.usernameExistsIgnoreCase("new@ex.com")).thenReturn(false);
            Team defaultTeam = new Team();
            defaultTeam.setId(1L);
            defaultTeam.setName(TeamService.DEFAULT_TEAM_NAME);
            when(teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME))
                    .thenReturn(Optional.of(defaultTeam));

            mockMvc.perform(
                            post("/api/v1/user/admin/inviteUsers")
                                    .principal(auth("admin"))
                                    .param("emails", "new@ex.com"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.successCount").value(1))
                    .andExpect(jsonPath("$.deliveredCount").value(1))
                    .andExpect(jsonPath("$.undelivered").isEmpty())
                    .andExpect(jsonPath("$.warning").doesNotExist());

            ArgumentCaptor<SaveUserRequest> saved = ArgumentCaptor.forClass(SaveUserRequest.class);
            verify(userService).saveUserCore(saved.capture());
            assertTrue(saved.getValue().isInvitePending());
        }

        @Test
        @DisplayName("reports the account as created but undelivered when the mail send fails")
        void mailFailureIsNotReportedAsDelivered() throws Exception {
            applicationProperties.getMail().setEnableInvites(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(userService.usernameExistsIgnoreCase("new@ex.com")).thenReturn(false);
            Team defaultTeam = new Team();
            defaultTeam.setId(1L);
            defaultTeam.setName(TeamService.DEFAULT_TEAM_NAME);
            when(teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME))
                    .thenReturn(Optional.of(defaultTeam));
            doThrow(new MessagingException("connection refused"))
                    .when(emailService)
                    .sendInviteEmail(eq("new@ex.com"), eq("new@ex.com"), any(), any());

            mockMvc.perform(
                            post("/api/v1/user/admin/inviteUsers")
                                    .principal(auth("admin"))
                                    .param("emails", "new@ex.com"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.successCount").value(1))
                    .andExpect(jsonPath("$.deliveredCount").value(0))
                    .andExpect(jsonPath("$.undelivered[0]").value("new@ex.com"))
                    .andExpect(jsonPath("$.warning").exists());
        }
    }

    @Nested
    @DisplayName("admin/resendInvite")
    class ResendInvite {

        @BeforeEach
        void enableInvites() {
            applicationProperties.getMail().setEnableInvites(true);
        }

        @Test
        @DisplayName("returns 404 for an unknown user")
        void userNotFound() throws Exception {
            when(userService.findByUsernameIgnoreCaseWithSettings("ghost@ex.com"))
                    .thenReturn(Optional.empty());

            mockMvc.perform(
                            post("/api/v1/user/admin/resendInvite")
                                    .principal(auth("admin"))
                                    .param("username", "ghost@ex.com"))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("refuses an account that has already been signed into")
        void refusesUsedAccount() throws Exception {
            User target = user("bob@ex.com");
            when(userService.findByUsernameIgnoreCaseWithSettings("bob@ex.com"))
                    .thenReturn(Optional.of(target));

            mockMvc.perform(
                            post("/api/v1/user/admin/resendInvite")
                                    .principal(auth("admin"))
                                    .param("username", "bob@ex.com"))
                    .andExpect(status().isBadRequest());

            verify(userService, never()).changePassword(any(), any());
        }

        @Test
        @DisplayName("refuses a directly-created account that merely must change its password")
        void refusesForcedPasswordChangeAccount() throws Exception {
            User target = user("bob@ex.com");
            target.setFirstLogin(true);
            when(userService.findByUsernameIgnoreCaseWithSettings("bob@ex.com"))
                    .thenReturn(Optional.of(target));

            mockMvc.perform(
                            post("/api/v1/user/admin/resendInvite")
                                    .principal(auth("admin"))
                                    .param("username", "bob@ex.com"))
                    .andExpect(status().isBadRequest());

            verify(userService, never()).changePassword(any(), any());
        }

        @Test
        @DisplayName("refuses a suspended account")
        void refusesSuspendedAccount() throws Exception {
            User target = user("bob@ex.com");
            markInvitePending(target);
            target.setEnabled(false);
            when(userService.findByUsernameIgnoreCaseWithSettings("bob@ex.com"))
                    .thenReturn(Optional.of(target));

            mockMvc.perform(
                            post("/api/v1/user/admin/resendInvite")
                                    .principal(auth("admin"))
                                    .param("username", "bob@ex.com"))
                    .andExpect(status().isBadRequest());

            verify(userService, never()).changePassword(any(), any());
        }

        @Test
        @DisplayName("refuses to resend the caller's own invitation")
        void refusesSelfTarget() throws Exception {
            mockMvc.perform(
                            post("/api/v1/user/admin/resendInvite")
                                    .principal(auth("admin"))
                                    .param("username", "admin"))
                    .andExpect(status().isBadRequest());

            verify(userService, never()).changePassword(any(), any());
        }

        @Test
        @DisplayName("rotates the temporary password and mails a fresh invitation")
        void resends() throws Exception {
            User target = user("bob@ex.com");
            markInvitePending(target);
            when(userService.findByUsernameIgnoreCaseWithSettings("bob@ex.com"))
                    .thenReturn(Optional.of(target));

            mockMvc.perform(
                            post("/api/v1/user/admin/resendInvite")
                                    .principal(auth("admin"))
                                    .param("username", "bob@ex.com"))
                    .andExpect(status().isOk());

            verify(userService).changePassword(eq(target), any());
            verify(userService).invalidateUserSessions("bob@ex.com");
            verify(emailService).sendInviteEmail(eq("bob@ex.com"), eq("bob@ex.com"), any(), any());
        }

        @Test
        @DisplayName("reports a delivery failure instead of a silent success")
        void reportsDeliveryFailure() throws Exception {
            User target = user("bob@ex.com");
            markInvitePending(target);
            when(userService.findByUsernameIgnoreCaseWithSettings("bob@ex.com"))
                    .thenReturn(Optional.of(target));
            doThrow(new MessagingException("connection refused"))
                    .when(emailService)
                    .sendInviteEmail(eq("bob@ex.com"), eq("bob@ex.com"), any(), any());

            mockMvc.perform(
                            post("/api/v1/user/admin/resendInvite")
                                    .principal(auth("admin"))
                                    .param("username", "bob@ex.com"))
                    .andExpect(status().isBadGateway());
        }
    }
}
