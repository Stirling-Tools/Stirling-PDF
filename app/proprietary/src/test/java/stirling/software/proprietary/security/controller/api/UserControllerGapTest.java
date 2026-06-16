package stirling.software.proprietary.security.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.security.Principal;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.userdetails.UserDetails;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.api.security.UserSummaryDTO;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;
import stirling.software.proprietary.service.UserLicenseSettingsService;

/**
 * Companion gap-coverage tests for {@link UserController}. Exercises the admin / user-management
 * handler branches not covered by {@code UserControllerTest} by invoking the handler methods
 * directly with mocked collaborators and asserting the returned {@link ResponseEntity}.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserControllerGapTest {

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
        controller =
                new UserController(
                        userService,
                        sessionRegistry,
                        applicationProperties,
                        teamRepository,
                        userRepository,
                        Optional.of(emailService),
                        licenseSettingsService,
                        loginAttemptService);
    }

    private UserController controllerWithoutEmail() {
        return new UserController(
                userService,
                sessionRegistry,
                applicationProperties,
                teamRepository,
                userRepository,
                Optional.empty(),
                licenseSettingsService,
                loginAttemptService);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> body(ResponseEntity<?> response) {
        return (Map<String, Object>) response.getBody();
    }

    private static Principal principal(String name) {
        return () -> name;
    }

    private User user(String username) {
        User u = new User();
        u.setUsername(username);
        return u;
    }

    // ---------------------------------------------------------------------
    // changeUsername
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("changeUsername")
    class ChangeUsername {

        @Test
        @DisplayName("rejects invalid username format before any auth check")
        void invalidUsernameFormat() throws Exception {
            when(userService.isUsernameValid("bad name")).thenReturn(false);

            ResponseEntity<?> response =
                    controller.changeUsername(
                            principal("alice"),
                            "pw",
                            "bad name",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("invalidUsername", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 401 when principal is null")
        void nullPrincipal() throws Exception {
            when(userService.isUsernameValid("newname")).thenReturn(true);

            ResponseEntity<?> response =
                    controller.changeUsername(
                            null,
                            "pw",
                            "newname",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            assertEquals("notAuthenticated", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 404 when current user not found")
        void userNotFound() throws Exception {
            when(userService.isUsernameValid("newname")).thenReturn(true);
            when(userService.findByUsername("alice")).thenReturn(Optional.empty());

            ResponseEntity<?> response =
                    controller.changeUsername(
                            principal("alice"),
                            "pw",
                            "newname",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertEquals("userNotFound", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 409 when new username equals current username")
        void sameUsernameConflict() throws Exception {
            when(userService.isUsernameValid("alice")).thenReturn(true);
            when(userService.findByUsername("alice")).thenReturn(Optional.of(user("alice")));

            ResponseEntity<?> response =
                    controller.changeUsername(
                            principal("alice"),
                            "pw",
                            "alice",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
            assertEquals("usernameExists", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 401 when current password is incorrect")
        void incorrectPassword() throws Exception {
            User alice = user("alice");
            when(userService.isUsernameValid("newname")).thenReturn(true);
            when(userService.findByUsername("alice")).thenReturn(Optional.of(alice));
            when(userService.isPasswordCorrect(alice, "wrong")).thenReturn(false);

            ResponseEntity<?> response =
                    controller.changeUsername(
                            principal("alice"),
                            "wrong",
                            "newname",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            assertEquals("incorrectPassword", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 409 when target username already exists")
        void targetUsernameExists() throws Exception {
            User alice = user("alice");
            when(userService.isUsernameValid("taken")).thenReturn(true);
            when(userService.findByUsername("alice")).thenReturn(Optional.of(alice));
            when(userService.isPasswordCorrect(alice, "pw")).thenReturn(true);
            when(userService.usernameExists("taken")).thenReturn(true);

            ResponseEntity<?> response =
                    controller.changeUsername(
                            principal("alice"),
                            "pw",
                            "taken",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
            assertEquals("usernameExists", body(response).get("error"));
        }

        @Test
        @DisplayName("succeeds, changes username and returns credsUpdated")
        void success() throws Exception {
            User alice = user("alice");
            when(userService.isUsernameValid("newname")).thenReturn(true);
            when(userService.findByUsername("alice")).thenReturn(Optional.of(alice));
            when(userService.isPasswordCorrect(alice, "pw")).thenReturn(true);
            when(userService.usernameExists("newname")).thenReturn(false);

            ResponseEntity<?> response =
                    controller.changeUsername(
                            principal("alice"),
                            "pw",
                            "newname",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("credsUpdated", body(response).get("message"));
            verify(userService).changeUsername(alice, "newname");
        }

        @Test
        @DisplayName("maps IllegalArgumentException from changeUsername to 400")
        void changeUsernameThrowsIllegalArgument() throws Exception {
            User alice = user("alice");
            when(userService.isUsernameValid("newname")).thenReturn(true);
            when(userService.findByUsername("alice")).thenReturn(Optional.of(alice));
            when(userService.isPasswordCorrect(alice, "pw")).thenReturn(true);
            when(userService.usernameExists("newname")).thenReturn(false);
            doThrow(new IllegalArgumentException("bad"))
                    .when(userService)
                    .changeUsername(alice, "newname");

            ResponseEntity<?> response =
                    controller.changeUsername(
                            principal("alice"),
                            "pw",
                            "newname",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("invalidUsername", body(response).get("error"));
        }
    }

    // ---------------------------------------------------------------------
    // changePasswordOnLogin
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("changePasswordOnLogin")
    class ChangePasswordOnLogin {

        @Test
        @DisplayName("returns 401 when principal is null")
        void nullPrincipal() throws Exception {
            ResponseEntity<?> response =
                    controller.changePasswordOnLogin(
                            null,
                            "old",
                            "new",
                            "new",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            assertEquals("notAuthenticated", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 404 when user not found")
        void userNotFound() throws Exception {
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.empty());

            ResponseEntity<?> response =
                    controller.changePasswordOnLogin(
                            principal("alice"),
                            "old",
                            "new",
                            "new",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertEquals("userNotFound", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 when a required parameter is missing")
        void missingParameters() throws Exception {
            when(userService.findByUsernameIgnoreCase("alice"))
                    .thenReturn(Optional.of(user("alice")));

            ResponseEntity<?> response =
                    controller.changePasswordOnLogin(
                            principal("alice"),
                            "",
                            "new",
                            "new",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("missingParameters", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 when new password and confirmation do not match")
        void passwordMismatch() throws Exception {
            when(userService.findByUsernameIgnoreCase("alice"))
                    .thenReturn(Optional.of(user("alice")));

            ResponseEntity<?> response =
                    controller.changePasswordOnLogin(
                            principal("alice"),
                            "old",
                            "new1",
                            "new2",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("passwordMismatch", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 when new password equals current password")
        void passwordUnchanged() throws Exception {
            when(userService.findByUsernameIgnoreCase("alice"))
                    .thenReturn(Optional.of(user("alice")));

            ResponseEntity<?> response =
                    controller.changePasswordOnLogin(
                            principal("alice"),
                            "same",
                            "same",
                            "same",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("passwordUnchanged", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 401 when current password is incorrect")
        void incorrectPassword() throws Exception {
            User alice = user("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(alice));
            when(userService.isPasswordCorrect(alice, "old")).thenReturn(false);

            ResponseEntity<?> response =
                    controller.changePasswordOnLogin(
                            principal("alice"),
                            "old",
                            "new",
                            "new",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            assertEquals("incorrectPassword", body(response).get("error"));
        }

        @Test
        @DisplayName("succeeds: clears force flag, changes password and first-use, returns ok")
        void success() throws Exception {
            User alice = user("alice");
            alice.setForcePasswordChange(true);
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(alice));
            when(userService.isPasswordCorrect(alice, "old")).thenReturn(true);

            ResponseEntity<?> response =
                    controller.changePasswordOnLogin(
                            principal("alice"),
                            "old",
                            "new",
                            "new",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("credsUpdated", body(response).get("message"));
            assertEquals(false, alice.isForcePasswordChange());
            verify(userService).changePassword(alice, "new");
            verify(userService).changeFirstUse(alice, false);
        }
    }

    // ---------------------------------------------------------------------
    // changePassword
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("changePassword")
    class ChangePassword {

        @Test
        @DisplayName("returns 401 when principal is null")
        void nullPrincipal() throws Exception {
            ResponseEntity<?> response =
                    controller.changePassword(
                            null,
                            "old",
                            "new",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            assertEquals("notAuthenticated", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 404 when user not found")
        void userNotFound() throws Exception {
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.empty());

            ResponseEntity<?> response =
                    controller.changePassword(
                            principal("alice"),
                            "old",
                            "new",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertEquals("userNotFound", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 401 when current password is incorrect")
        void incorrectPassword() throws Exception {
            User alice = user("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(alice));
            when(userService.isPasswordCorrect(alice, "old")).thenReturn(false);

            ResponseEntity<?> response =
                    controller.changePassword(
                            principal("alice"),
                            "old",
                            "new",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            assertEquals("incorrectPassword", body(response).get("error"));
        }

        @Test
        @DisplayName("succeeds, changes password and returns credsUpdated")
        void success() throws Exception {
            User alice = user("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(alice));
            when(userService.isPasswordCorrect(alice, "old")).thenReturn(true);

            ResponseEntity<?> response =
                    controller.changePassword(
                            principal("alice"),
                            "old",
                            "new",
                            new MockHttpServletRequest(),
                            new MockHttpServletResponse());

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("credsUpdated", body(response).get("message"));
            verify(userService).changePassword(alice, "new");
        }
    }

    // ---------------------------------------------------------------------
    // updateUserSettings
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("updateUserSettings delegates to service and returns ok")
    void updateUserSettings() throws Exception {
        Map<String, String> updates = Map.of("theme", "dark");

        ResponseEntity<?> response = controller.updateUserSettings(updates, principal("alice"));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("Settings updated successfully", body(response).get("message"));
        verify(userService).updateUserSettings("alice", updates);
    }

    // ---------------------------------------------------------------------
    // saveUser (admin)
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("saveUser")
    class SaveUser {

        @Test
        @DisplayName("returns 400 for invalid username format")
        void invalidUsername() throws Exception {
            when(userService.isUsernameValid("ab")).thenReturn(false);

            ResponseEntity<?> response =
                    controller.saveUser("ab", "password", "ROLE_USER", null, "WEB", false, false);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertTrue(((String) body(response).get("error")).contains("Invalid username format"));
        }

        @Test
        @DisplayName("returns 400 when license limit would be exceeded")
        void licenseLimitExceeded() throws Exception {
            when(userService.isUsernameValid("newuser")).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(true);
            when(licenseSettingsService.getAvailableUserSlots()).thenReturn(0L);
            when(licenseSettingsService.calculateMaxAllowedUsers()).thenReturn(5);

            ResponseEntity<?> response =
                    controller.saveUser(
                            "newuser", "password", "ROLE_USER", null, "WEB", false, false);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertTrue(
                    ((String) body(response).get("error"))
                            .contains("Maximum number of users reached"));
        }

        @Test
        @DisplayName("returns 409 when username already exists (case-insensitive)")
        void usernameAlreadyExists() throws Exception {
            when(userService.isUsernameValid("newuser")).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(userService.findByUsernameIgnoreCase("newuser"))
                    .thenReturn(Optional.of(user("newuser")));

            ResponseEntity<?> response =
                    controller.saveUser(
                            "newuser", "password", "ROLE_USER", null, "WEB", false, false);

            assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
            assertEquals("Username already exists.", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 when assigning INTERNAL_API_USER role")
        void internalApiUserRoleRejected() throws Exception {
            when(userService.isUsernameValid("newuser")).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(userService.findByUsernameIgnoreCase("newuser")).thenReturn(Optional.empty());
            when(userService.usernameExistsIgnoreCase("newuser")).thenReturn(false);

            ResponseEntity<?> response =
                    controller.saveUser(
                            "newuser",
                            "password",
                            "STIRLING-PDF-BACKEND-API-USER",
                            null,
                            "WEB",
                            false,
                            false);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Cannot assign INTERNAL_API_USER role.", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 for unknown role")
        void invalidRole() throws Exception {
            when(userService.isUsernameValid("newuser")).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(userService.findByUsernameIgnoreCase("newuser")).thenReturn(Optional.empty());
            when(userService.usernameExistsIgnoreCase("newuser")).thenReturn(false);

            ResponseEntity<?> response =
                    controller.saveUser(
                            "newuser", "password", "ROLE_BOGUS", null, "WEB", false, false);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Invalid role specified.", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 when target team is the Internal team")
        void internalTeamRejected() throws Exception {
            when(userService.isUsernameValid("newuser")).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(userService.findByUsernameIgnoreCase("newuser")).thenReturn(Optional.empty());
            when(userService.usernameExistsIgnoreCase("newuser")).thenReturn(false);
            Team internal = new Team();
            internal.setName(TeamService.INTERNAL_TEAM_NAME);
            when(teamRepository.findById(7L)).thenReturn(Optional.of(internal));

            ResponseEntity<?> response =
                    controller.saveUser(
                            "newuser", "password", "ROLE_USER", 7L, "WEB", false, false);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Cannot assign users to Internal team.", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 for invalid authentication type")
        void invalidAuthType() throws Exception {
            when(userService.isUsernameValid("newuser")).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(userService.findByUsernameIgnoreCase("newuser")).thenReturn(Optional.empty());
            when(userService.usernameExistsIgnoreCase("newuser")).thenReturn(false);

            ResponseEntity<?> response =
                    controller.saveUser(
                            "newuser", "password", "ROLE_USER", 3L, "BOGUS", false, false);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Invalid authentication type specified.", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 when WEB auth has no password")
        void webAuthMissingPassword() throws Exception {
            when(userService.isUsernameValid("newuser")).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(userService.findByUsernameIgnoreCase("newuser")).thenReturn(Optional.empty());
            when(userService.usernameExistsIgnoreCase("newuser")).thenReturn(false);

            ResponseEntity<?> response =
                    controller.saveUser("newuser", "  ", "ROLE_USER", 3L, "WEB", false, false);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Password is required.", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 when WEB auth password is too short")
        void webAuthPasswordTooShort() throws Exception {
            when(userService.isUsernameValid("newuser")).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(userService.findByUsernameIgnoreCase("newuser")).thenReturn(Optional.empty());
            when(userService.usernameExistsIgnoreCase("newuser")).thenReturn(false);

            ResponseEntity<?> response =
                    controller.saveUser("newuser", "abc", "ROLE_USER", 3L, "WEB", false, false);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Password must be at least 6 characters.", body(response).get("error"));
        }

        @Test
        @DisplayName("creates a WEB user with an explicit team, mapping SSO->OAUTH2 not triggered")
        void successWeb() throws Exception {
            when(userService.isUsernameValid("newuser")).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(userService.findByUsernameIgnoreCase("newuser")).thenReturn(Optional.empty());
            when(userService.usernameExistsIgnoreCase("newuser")).thenReturn(false);
            Team regular = new Team();
            regular.setName("Marketing");
            when(teamRepository.findById(3L)).thenReturn(Optional.of(regular));

            ResponseEntity<?> response =
                    controller.saveUser("newuser", "password", "ROLE_USER", 3L, "WEB", true, true);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("User created successfully", body(response).get("message"));
            verify(userService).saveUserCore(any());
        }

        @Test
        @DisplayName("SSO auth type maps to OAUTH2 and skips password requirement")
        void ssoAuthSkipsPassword() throws Exception {
            when(userService.isUsernameValid("ssouser")).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(userService.findByUsernameIgnoreCase("ssouser")).thenReturn(Optional.empty());
            when(userService.usernameExistsIgnoreCase("ssouser")).thenReturn(false);
            Team defaultTeam = new Team();
            defaultTeam.setId(1L);
            defaultTeam.setName(TeamService.DEFAULT_TEAM_NAME);
            when(teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME))
                    .thenReturn(Optional.of(defaultTeam));

            // No password supplied, but SSO->OAUTH2 means WEB password branch is skipped.
            ResponseEntity<?> response =
                    controller.saveUser("ssouser", null, "ROLE_USER", null, "SSO", false, false);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("User created successfully", body(response).get("message"));
            verify(userService).saveUserCore(any());
        }
    }

    // ---------------------------------------------------------------------
    // inviteUsers (admin)
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("inviteUsers")
    class InviteUsers {

        @Test
        @DisplayName("returns 400 when email invites are disabled")
        void invitesDisabled() throws Exception {
            applicationProperties.getMail().setEnableInvites(false);

            ResponseEntity<?> response =
                    controller.inviteUsers(
                            "a@b.com", "ROLE_USER", null, new MockHttpServletRequest());

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Email invites are not enabled", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 503 when email service is not configured")
        void emailServiceUnavailable() throws Exception {
            applicationProperties.getMail().setEnableInvites(true);
            UserController noEmail = controllerWithoutEmail();

            ResponseEntity<?> response =
                    noEmail.inviteUsers("a@b.com", "ROLE_USER", null, new MockHttpServletRequest());

            assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode());
            assertTrue(
                    ((String) body(response).get("error"))
                            .contains("Email service is not configured"));
        }

        @Test
        @DisplayName("returns 400 when license limit would be exceeded")
        void licenseLimitExceeded() throws Exception {
            applicationProperties.getMail().setEnableInvites(true);
            when(licenseSettingsService.wouldExceedLimit(2)).thenReturn(true);
            when(licenseSettingsService.getAvailableUserSlots()).thenReturn(1L);
            when(licenseSettingsService.calculateMaxAllowedUsers()).thenReturn(5);

            ResponseEntity<?> response =
                    controller.inviteUsers(
                            "a@b.com,c@d.com", "ROLE_USER", null, new MockHttpServletRequest());

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertTrue(
                    ((String) body(response).get("error"))
                            .contains("Not enough user slots available"));
        }

        @Test
        @DisplayName("returns 400 when role is INTERNAL_API_USER")
        void internalApiUserRoleRejected() throws Exception {
            applicationProperties.getMail().setEnableInvites(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);

            ResponseEntity<?> response =
                    controller.inviteUsers(
                            "a@b.com",
                            "STIRLING-PDF-BACKEND-API-USER",
                            null,
                            new MockHttpServletRequest());

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Cannot assign INTERNAL_API_USER role", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 when role is invalid")
        void invalidRole() throws Exception {
            applicationProperties.getMail().setEnableInvites(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);

            ResponseEntity<?> response =
                    controller.inviteUsers(
                            "a@b.com", "ROLE_BOGUS", null, new MockHttpServletRequest());

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Invalid role specified", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 when target team is the Internal team")
        void internalTeamRejected() throws Exception {
            applicationProperties.getMail().setEnableInvites(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            Team internal = new Team();
            internal.setName(TeamService.INTERNAL_TEAM_NAME);
            when(teamRepository.findById(9L)).thenReturn(Optional.of(internal));

            ResponseEntity<?> response =
                    controller.inviteUsers(
                            "a@b.com", "ROLE_USER", 9L, new MockHttpServletRequest());

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Cannot assign users to Internal team", body(response).get("error"));
        }

        @Test
        @DisplayName("invites a valid user successfully and reports counts")
        void successfulInvite() throws Exception {
            applicationProperties.getMail().setEnableInvites(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            Team defaultTeam = new Team();
            defaultTeam.setId(1L);
            defaultTeam.setName(TeamService.DEFAULT_TEAM_NAME);
            when(teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME))
                    .thenReturn(Optional.of(defaultTeam));
            when(userService.usernameExistsIgnoreCase("new@example.com")).thenReturn(false);

            ResponseEntity<?> response =
                    controller.inviteUsers(
                            "new@example.com", "ROLE_USER", null, new MockHttpServletRequest());

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals(1, body(response).get("successCount"));
            assertEquals(0, body(response).get("failureCount"));
            verify(userService).saveUserCore(any());
            verify(emailService)
                    .sendInviteEmail(
                            eq("new@example.com"), eq("new@example.com"), anyString(), anyString());
        }

        @Test
        @DisplayName("reports failure for an existing user and returns 400 overall")
        void inviteExistingUserFails() throws Exception {
            applicationProperties.getMail().setEnableInvites(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            Team defaultTeam = new Team();
            defaultTeam.setId(1L);
            defaultTeam.setName(TeamService.DEFAULT_TEAM_NAME);
            when(teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME))
                    .thenReturn(Optional.of(defaultTeam));
            when(userService.usernameExistsIgnoreCase("dupe@example.com")).thenReturn(true);

            ResponseEntity<?> response =
                    controller.inviteUsers(
                            "dupe@example.com", "ROLE_USER", null, new MockHttpServletRequest());

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals(0, body(response).get("successCount"));
            assertEquals(1, body(response).get("failureCount"));
            assertEquals("Failed to invite any users", body(response).get("error"));
            verify(userService, never()).saveUserCore(any());
        }

        @Test
        @DisplayName("invalid email format is recorded as a failure")
        void invalidEmailFormatFails() throws Exception {
            applicationProperties.getMail().setEnableInvites(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            Team defaultTeam = new Team();
            defaultTeam.setId(1L);
            defaultTeam.setName(TeamService.DEFAULT_TEAM_NAME);
            when(teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME))
                    .thenReturn(Optional.of(defaultTeam));

            ResponseEntity<?> response =
                    controller.inviteUsers(
                            "notanemail", "ROLE_USER", null, new MockHttpServletRequest());

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals(1, body(response).get("failureCount"));
            assertTrue(((String) body(response).get("errors")).contains("Invalid email format"));
            verify(userService, never()).saveUserCore(any());
        }
    }

    // ---------------------------------------------------------------------
    // changeRole (admin)
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("changeRole")
    class ChangeRole {

        private Authentication auth(String name) {
            Authentication a = org.mockito.Mockito.mock(Authentication.class);
            when(a.getName()).thenReturn(name);
            return a;
        }

        @Test
        @DisplayName("returns 404 when user not found")
        void userNotFound() throws Exception {
            when(userService.findByUsernameIgnoreCase("ghost")).thenReturn(Optional.empty());

            ResponseEntity<?> response =
                    controller.changeRole("ghost", "ROLE_USER", null, auth("admin"));

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertEquals("User not found.", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 when changing your own role")
        void cannotChangeOwnRole() throws Exception {
            when(userService.findByUsernameIgnoreCase("admin"))
                    .thenReturn(Optional.of(user("admin")));
            when(userService.usernameExistsIgnoreCase("admin")).thenReturn(true);

            ResponseEntity<?> response =
                    controller.changeRole("admin", "ROLE_USER", null, auth("admin"));

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Cannot change your own role.", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 when assigning INTERNAL_API_USER role")
        void internalApiUserRoleRejected() throws Exception {
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(user("bob")));
            when(userService.usernameExistsIgnoreCase("bob")).thenReturn(true);

            ResponseEntity<?> response =
                    controller.changeRole(
                            "bob", "STIRLING-PDF-BACKEND-API-USER", null, auth("admin"));

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Cannot assign INTERNAL_API_USER role.", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 for an invalid role")
        void invalidRole() throws Exception {
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(user("bob")));
            when(userService.usernameExistsIgnoreCase("bob")).thenReturn(true);

            ResponseEntity<?> response =
                    controller.changeRole("bob", "ROLE_BOGUS", null, auth("admin"));

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Invalid role specified.", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 when assigning user to the Internal team")
        void internalTeamRejected() throws Exception {
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(user("bob")));
            when(userService.usernameExistsIgnoreCase("bob")).thenReturn(true);
            Team internal = new Team();
            internal.setName(TeamService.INTERNAL_TEAM_NAME);
            when(teamRepository.findById(9L)).thenReturn(Optional.of(internal));

            ResponseEntity<?> response =
                    controller.changeRole("bob", "ROLE_USER", 9L, auth("admin"));

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Cannot assign users to Internal team.", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 when moving a user out of the Internal team")
        void cannotMoveFromInternalTeam() throws Exception {
            User bob = user("bob");
            Team currentInternal = new Team();
            currentInternal.setName(TeamService.INTERNAL_TEAM_NAME);
            bob.setTeam(currentInternal);
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(bob));
            when(userService.usernameExistsIgnoreCase("bob")).thenReturn(true);
            Team target = new Team();
            target.setName("Marketing");
            when(teamRepository.findById(5L)).thenReturn(Optional.of(target));

            ResponseEntity<?> response =
                    controller.changeRole("bob", "ROLE_USER", 5L, auth("admin"));

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Cannot move users from Internal team.", body(response).get("error"));
        }

        @Test
        @DisplayName("updates team and role successfully")
        void successWithTeamChange() throws Exception {
            User bob = user("bob");
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(bob));
            when(userService.usernameExistsIgnoreCase("bob")).thenReturn(true);
            Team target = new Team();
            target.setName("Marketing");
            when(teamRepository.findById(5L)).thenReturn(Optional.of(target));

            ResponseEntity<?> response =
                    controller.changeRole("bob", "ROLE_ADMIN", 5L, auth("admin"));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("User role updated successfully", body(response).get("message"));
            verify(userRepository).save(bob);
            verify(userService).changeRole(bob, "ROLE_ADMIN");
            assertEquals(target, bob.getTeam());
        }

        @Test
        @DisplayName("updates role without a team change when teamId is null")
        void successWithoutTeamChange() throws Exception {
            User bob = user("bob");
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(bob));
            when(userService.usernameExistsIgnoreCase("bob")).thenReturn(true);

            ResponseEntity<?> response =
                    controller.changeRole("bob", "ROLE_USER", null, auth("admin"));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            verify(userService).changeRole(bob, "ROLE_USER");
            verify(userRepository, never()).save(any());
        }
    }

    // ---------------------------------------------------------------------
    // changePasswordForUser (admin)
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("changePasswordForUser")
    class ChangePasswordForUser {

        private Authentication auth(String name) {
            Authentication a = org.mockito.Mockito.mock(Authentication.class);
            when(a.getName()).thenReturn(name);
            return a;
        }

        @Test
        @DisplayName("returns 404 when user not found")
        void userNotFound() throws Exception {
            when(userService.findByUsernameIgnoreCase("ghost")).thenReturn(Optional.empty());

            ResponseEntity<?> response =
                    controller.changePasswordForUser(
                            "ghost",
                            "newpass",
                            false,
                            false,
                            false,
                            false,
                            new MockHttpServletRequest(),
                            auth("admin"));

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertEquals("User not found.", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 when changing your own password")
        void cannotChangeOwnPassword() throws Exception {
            when(userService.findByUsernameIgnoreCase("admin"))
                    .thenReturn(Optional.of(user("admin")));

            ResponseEntity<?> response =
                    controller.changePasswordForUser(
                            "admin",
                            "newpass",
                            false,
                            false,
                            false,
                            false,
                            new MockHttpServletRequest(),
                            auth("admin"));

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Cannot change your own password.", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 when no password supplied and not generating one")
        void missingPassword() throws Exception {
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(user("bob")));

            ResponseEntity<?> response =
                    controller.changePasswordForUser(
                            "bob",
                            "   ",
                            false,
                            false,
                            false,
                            false,
                            new MockHttpServletRequest(),
                            auth("admin"));

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("New password is required.", body(response).get("error"));
        }

        @Test
        @DisplayName("succeeds without email, sets force flag and invalidates sessions")
        void successNoEmail() throws Exception {
            User bob = user("bob");
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(bob));

            ResponseEntity<?> response =
                    controller.changePasswordForUser(
                            "bob",
                            "newpass",
                            false,
                            false,
                            false,
                            true,
                            new MockHttpServletRequest(),
                            auth("admin"));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("User password updated successfully", body(response).get("message"));
            assertTrue(bob.isForcePasswordChange());
            verify(userService).changePassword(bob, "newpass");
            verify(userService).invalidateUserSessions("bob");
        }

        @Test
        @DisplayName("generateRandom produces a password and changes it")
        void generateRandomPassword() throws Exception {
            User bob = user("bob");
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(bob));

            ResponseEntity<?> response =
                    controller.changePasswordForUser(
                            "bob",
                            null,
                            true,
                            false,
                            false,
                            false,
                            new MockHttpServletRequest(),
                            auth("admin"));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            verify(userService).changePassword(eq(bob), anyString());
        }

        @Test
        @DisplayName("returns 400 when sendEmail but mail not configured")
        void sendEmailMailNotConfigured() throws Exception {
            applicationProperties.getMail().setEnabled(false);
            UserController noEmail = controllerWithoutEmail();
            User bob = user("bob");
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(bob));

            ResponseEntity<?> response =
                    noEmail.changePasswordForUser(
                            "bob",
                            "newpass",
                            false,
                            true,
                            false,
                            false,
                            new MockHttpServletRequest(),
                            auth("admin"));

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Email is not configured.", body(response).get("error"));
        }

        @Test
        @DisplayName("returns 400 when sendEmail but username is not a valid email")
        void sendEmailInvalidUserEmail() throws Exception {
            applicationProperties.getMail().setEnabled(true);
            User bob = user("bob"); // no @ in username
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(bob));

            ResponseEntity<?> response =
                    controller.changePasswordForUser(
                            "bob",
                            "newpass",
                            false,
                            true,
                            false,
                            false,
                            new MockHttpServletRequest(),
                            auth("admin"));

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertTrue(
                    ((String) body(response).get("error")).contains("not a valid email address"));
        }

        @Test
        @DisplayName("sends notification email with password when includePassword=true")
        void sendEmailIncludesPassword() throws Exception {
            applicationProperties.getMail().setEnabled(true);
            User bob = user("bob@example.com");
            when(userService.findByUsernameIgnoreCase("bob@example.com"))
                    .thenReturn(Optional.of(bob));
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setScheme("https");
            request.setServerName("app.example.com");
            request.setServerPort(443);

            ResponseEntity<?> response =
                    controller.changePasswordForUser(
                            "bob@example.com",
                            "newpass",
                            false,
                            true,
                            true,
                            false,
                            request,
                            auth("admin"));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            verify(emailService)
                    .sendPasswordChangedNotification(
                            eq("bob@example.com"),
                            eq("bob@example.com"),
                            eq("newpass"),
                            eq("https://app.example.com/login"));
        }
    }

    // ---------------------------------------------------------------------
    // changeUserEnabled (admin) - happy/disabled paths
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("changeUserEnabled")
    class ChangeUserEnabled {

        private Authentication auth(String name) {
            Authentication a = org.mockito.Mockito.mock(Authentication.class);
            when(a.getName()).thenReturn(name);
            return a;
        }

        @Test
        @DisplayName("returns 404 when user not found")
        void userNotFound() throws Exception {
            when(userService.findByUsernameIgnoreCase("ghost")).thenReturn(Optional.empty());

            ResponseEntity<?> response = controller.changeUserEnabled("ghost", true, auth("admin"));

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertEquals("User not found.", body(response).get("error"));
        }

        @Test
        @DisplayName("enabling a user does not enumerate sessions")
        void enableUser() throws Exception {
            User bob = user("bob");
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(bob));
            when(userService.usernameExistsIgnoreCase("bob")).thenReturn(true);

            ResponseEntity<?> response = controller.changeUserEnabled("bob", true, auth("admin"));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("User enabled successfully", body(response).get("message"));
            verify(userService).changeUserEnabled(bob, true);
            verify(sessionRegistry, never()).getAllPrincipals();
        }

        @Test
        @DisplayName("disabling a user expires matching sessions for a string principal")
        void disableUserExpiresSessions() throws Exception {
            User bob = user("bob");
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(bob));
            when(userService.usernameExistsIgnoreCase("bob")).thenReturn(true);
            when(sessionRegistry.getAllPrincipals())
                    .thenReturn(List.of((Object) "bob", (Object) "alice"));
            SessionInformation bobSession = new SessionInformation("bob", "sess-bob", new Date());
            when(sessionRegistry.getAllSessions("bob", false)).thenReturn(List.of(bobSession));
            when(sessionRegistry.getAllSessions("alice", false)).thenReturn(List.of());

            ResponseEntity<?> response = controller.changeUserEnabled("bob", false, auth("admin"));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("User disabled successfully", body(response).get("message"));
            verify(userService).changeUserEnabled(bob, false);
            verify(sessionRegistry).expireSession("sess-bob");
        }

        @Test
        @DisplayName("disabling resolves a UserDetails principal by username")
        void disableUserDetailsPrincipal() throws Exception {
            User bob = user("bob");
            when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.of(bob));
            when(userService.usernameExistsIgnoreCase("bob")).thenReturn(true);
            UserDetails details = org.mockito.Mockito.mock(UserDetails.class);
            when(details.getUsername()).thenReturn("bob");
            when(sessionRegistry.getAllPrincipals()).thenReturn(List.of((Object) details));
            SessionInformation session = new SessionInformation(details, "sess-1", new Date());
            when(sessionRegistry.getAllSessions(details, false)).thenReturn(List.of(session));

            ResponseEntity<?> response = controller.changeUserEnabled("bob", false, auth("admin"));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            verify(sessionRegistry).expireSession("sess-1");
        }
    }

    // ---------------------------------------------------------------------
    // deleteUser (admin) - happy path
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("deleteUser")
    class DeleteUser {

        private Authentication auth(String name) {
            Authentication a = org.mockito.Mockito.mock(Authentication.class);
            when(a.getName()).thenReturn(name);
            return a;
        }

        @Test
        @DisplayName("returns 400 when deleting your own account")
        void cannotDeleteOwnAccount() throws Exception {
            when(userService.usernameExistsIgnoreCase("admin")).thenReturn(true);

            ResponseEntity<?> response = controller.deleteUser("admin", auth("admin"));

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Cannot delete your own account.", body(response).get("error"));
            verify(userService, never()).deleteUser(anyString());
        }

        @Test
        @DisplayName("deletes user, expiring and removing all sessions")
        void deleteSuccess() throws Exception {
            when(userService.usernameExistsIgnoreCase("bob")).thenReturn(true);
            SessionInformation session = new SessionInformation("bob", "sess-bob", new Date());
            when(sessionRegistry.getAllSessions("bob", false)).thenReturn(List.of(session));

            ResponseEntity<?> response = controller.deleteUser("bob", auth("admin"));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("User deleted successfully", body(response).get("message"));
            verify(sessionRegistry).expireSession("sess-bob");
            verify(sessionRegistry).removeSessionInformation("sess-bob");
            verify(userService).deleteUser("bob");
        }
    }

    // ---------------------------------------------------------------------
    // getApiKey / updateApiKey
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("API key endpoints")
    class ApiKeyEndpoints {

        @Test
        @DisplayName("getApiKey returns 403 when not authenticated")
        void getApiKeyUnauthenticated() {
            ResponseEntity<Map<String, String>> response = controller.getApiKey(null);

            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
            assertEquals("User not authenticated.", response.getBody().get("error"));
        }

        @Test
        @DisplayName("getApiKey returns 404 when no key exists")
        void getApiKeyNotFound() {
            when(userService.getApiKeyForUser("alice")).thenReturn(null);

            ResponseEntity<Map<String, String>> response = controller.getApiKey(principal("alice"));

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertEquals("API key not found for user.", response.getBody().get("error"));
        }

        @Test
        @DisplayName("getApiKey returns the key when present")
        void getApiKeySuccess() {
            when(userService.getApiKeyForUser("alice")).thenReturn("secret-key");

            ResponseEntity<Map<String, String>> response = controller.getApiKey(principal("alice"));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("secret-key", response.getBody().get("apiKey"));
        }

        @Test
        @DisplayName("updateApiKey returns 403 when not authenticated")
        void updateApiKeyUnauthenticated() {
            ResponseEntity<Map<String, String>> response = controller.updateApiKey(null);

            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
            assertEquals("User not authenticated.", response.getBody().get("error"));
        }

        @Test
        @DisplayName("updateApiKey returns 404 when refreshed key is null")
        void updateApiKeyNullKey() {
            User refreshed = user("alice");
            refreshed.setApiKey(null);
            when(userService.refreshApiKeyForUser("alice")).thenReturn(refreshed);

            ResponseEntity<Map<String, String>> response =
                    controller.updateApiKey(principal("alice"));

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertEquals("API key not found for user.", response.getBody().get("error"));
        }

        @Test
        @DisplayName("updateApiKey returns the refreshed key")
        void updateApiKeySuccess() {
            User refreshed = user("alice");
            refreshed.setApiKey("fresh-key");
            when(userService.refreshApiKeyForUser("alice")).thenReturn(refreshed);

            ResponseEntity<Map<String, String>> response =
                    controller.updateApiKey(principal("alice"));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("fresh-key", response.getBody().get("apiKey"));
        }
    }

    // ---------------------------------------------------------------------
    // completeInitialSetup
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("completeInitialSetup")
    class CompleteInitialSetup {

        @Test
        @DisplayName("returns 401 for anonymous user")
        void anonymousUser() {
            when(userService.getCurrentUsername()).thenReturn("anonymousUser");

            ResponseEntity<?> response = controller.completeInitialSetup();

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            assertEquals("User not authenticated", response.getBody());
        }

        @Test
        @DisplayName("returns 401 when current username is null")
        void nullUsername() {
            when(userService.getCurrentUsername()).thenReturn(null);

            ResponseEntity<?> response = controller.completeInitialSetup();

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        }

        @Test
        @DisplayName("returns 404 when user not found")
        void userNotFound() {
            when(userService.getCurrentUsername()).thenReturn("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.empty());

            ResponseEntity<?> response = controller.completeInitialSetup();

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertEquals("User not found", response.getBody());
        }

        @Test
        @DisplayName("marks setup complete and saves the user")
        void success() {
            User alice = user("alice");
            when(userService.getCurrentUsername()).thenReturn("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(alice));

            ResponseEntity<?> response = controller.completeInitialSetup();

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertTrue(alice.hasCompletedInitialSetup());
            verify(userRepository).save(alice);
        }

        @Test
        @DisplayName("returns 500 when persistence throws")
        void persistenceError() {
            User alice = user("alice");
            when(userService.getCurrentUsername()).thenReturn("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(alice));
            when(userRepository.save(alice)).thenThrow(new RuntimeException("db down"));

            ResponseEntity<?> response = controller.completeInitialSetup();

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertEquals("Failed to complete initial setup", response.getBody());
        }
    }

    // ---------------------------------------------------------------------
    // listUsers
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("listUsers")
    class ListUsers {

        @Test
        @DisplayName("returns 401 when principal is null")
        void nullPrincipal() {
            ResponseEntity<List<UserSummaryDTO>> response = controller.listUsers(null);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        }

        @Test
        @DisplayName("returns only enabled users mapped to summaries")
        void onlyEnabledUsers() {
            User enabled = user("enabled@example.com");
            enabled.setId(1L);
            enabled.setEnabled(true);
            Team team = new Team();
            team.setName("Marketing");
            enabled.setTeam(team);

            User disabled = user("disabled@example.com");
            disabled.setId(2L);
            disabled.setEnabled(false);

            when(userRepository.findAll()).thenReturn(List.of(enabled, disabled));

            ResponseEntity<List<UserSummaryDTO>> response =
                    controller.listUsers(principal("admin"));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            List<UserSummaryDTO> users = response.getBody();
            assertNotNull(users);
            assertEquals(1, users.size());
            UserSummaryDTO dto = users.get(0);
            assertEquals(1L, dto.getUserId());
            assertEquals("enabled@example.com", dto.getUsername());
            assertEquals("Marketing", dto.getTeamName());
            assertTrue(dto.isEnabled());
        }

        @Test
        @DisplayName("maps a null team to a null teamName")
        void nullTeamMapsToNull() {
            User u = user("noteam@example.com");
            u.setId(3L);
            u.setEnabled(true);
            when(userRepository.findAll()).thenReturn(List.of(u));

            ResponseEntity<List<UserSummaryDTO>> response =
                    controller.listUsers(principal("admin"));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals(1, response.getBody().size());
            assertNull(response.getBody().get(0).getTeamName());
        }
    }

    // ---------------------------------------------------------------------
    // saveUser: default-team fallback path
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("saveUser falls back to the default team when teamId is null")
    void saveUserDefaultTeamFallback() throws Exception {
        when(userService.isUsernameValid("newuser")).thenReturn(true);
        when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
        when(userService.findByUsernameIgnoreCase("newuser")).thenReturn(Optional.empty());
        when(userService.usernameExistsIgnoreCase("newuser")).thenReturn(false);
        Team defaultTeam = new Team();
        defaultTeam.setId(1L);
        defaultTeam.setName(TeamService.DEFAULT_TEAM_NAME);
        when(teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME))
                .thenReturn(Optional.of(defaultTeam));

        ResponseEntity<?> response =
                controller.saveUser("newuser", "password", "ROLE_USER", null, "WEB", false, false);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(teamRepository).findByName(TeamService.DEFAULT_TEAM_NAME);
        verify(userService).saveUserCore(any());
    }

    @Test
    @DisplayName("MockHttpServletRequest satisfies the HttpServletRequest handler parameter")
    void requestTypeSanity() {
        // Guards against an accidental signature change on the request-consuming handlers.
        HttpServletRequest request = new MockHttpServletRequest();
        assertInstanceOf(HttpServletRequest.class, request);
    }
}
