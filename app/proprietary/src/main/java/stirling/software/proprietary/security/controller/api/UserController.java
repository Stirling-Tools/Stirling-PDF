package stirling.software.proprietary.security.controller.api;

import java.io.IOException;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.jboss.resteasy.reactive.RestForm;

import io.vertx.core.http.HttpServerRequest;

import jakarta.annotation.security.RolesAllowed;
import jakarta.mail.MessagingException;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;
import jakarta.ws.rs.core.UriInfo;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.UserApi;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.api.security.UserSummaryDTO;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.common.security.OAuth2User;
import stirling.software.common.security.SessionInformation;
import stirling.software.common.security.UserDetails;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.annotation.DenyDemoUser;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.api.user.UsernameAndPass;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.SaveUserRequest;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;
import stirling.software.proprietary.service.UserLicenseSettingsService;

@UserApi
@jakarta.ws.rs.Path("/api/v1/user")
@jakarta.enterprise.context.ApplicationScoped
@Slf4j
@RequiredArgsConstructor
public class UserController {

    private static final String LOGIN_MESSAGETYPE_CREDSUPDATED = "/login?messageType=credsUpdated";
    private final UserService userService;
    private final SessionPersistentRegistry sessionRegistry;
    private final ApplicationProperties applicationProperties;
    private final TeamRepository teamRepository;
    private final UserRepository userRepository;
    // @Autowired(required=false) Optional<EmailService> -> CDI Instance<EmailService>.
    private final jakarta.enterprise.inject.Instance<EmailService> emailService;
    private final UserLicenseSettingsService licenseSettingsService;
    private final LoginAttemptService loginAttemptService;

    // JAX-RS injects the current security context; replaces Spring's Principal/Authentication
    // method parameters. securityContext.getUserPrincipal() is null when unauthenticated.
    @Context SecurityContext securityContext;

    // Spring's @RequestParam bound a value from EITHER the query string OR the form body.
    // RESTEasy's
    // @RestForm only reads the body, so admin/account endpoints invoked with query parameters (as
    // the regression suite and some clients do) would otherwise see null. UriInfo lets the
    // @RestForm
    // params fall back to the query string, restoring the original union semantics. See
    // formOrQuery / formOrQueryLong / formOrQueryBool.
    @Context UriInfo uriInfo;

    @DenyDemoUser
    @POST
    @jakarta.ws.rs.Path("/register")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response register(UsernameAndPass usernameAndPass)
            throws SQLException, UnsupportedProviderException {
        String username = usernameAndPass.getUsername();
        String password = usernameAndPass.getPassword();
        try {
            log.debug("Registration attempt for user: {}", username);

            if (userService.usernameExistsIgnoreCase(username)) {
                log.warn("Registration failed: username already exists: {}", username);
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "User already exists"))
                        .build();
            }

            if (!userService.isUsernameValid(username)) {
                log.warn("Registration failed: invalid username format: {}", username);
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Invalid username format"))
                        .build();
            }

            if (password == null || password.isEmpty()) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Password is required"))
                        .build();
            }

            if (licenseSettingsService.wouldExceedLimit(1)) {
                long availableSlots = licenseSettingsService.getAvailableUserSlots();
                int maxAllowed = licenseSettingsService.calculateMaxAllowedUsers();
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(
                                Map.of(
                                        "error",
                                        "Maximum number of users reached. Allowed: "
                                                + maxAllowed
                                                + ", Available slots: "
                                                + availableSlots))
                        .build();
            }
            Team team = teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME).orElse(null);
            SaveUserRequest.Builder builder =
                    SaveUserRequest.builder()
                            .username(username)
                            .password(password)
                            .team(team)
                            .enabled(false);
            User user = userService.saveUserCore(builder.build());

            log.info("User registered successfully: {}", username);

            return Response.status(Response.Status.CREATED)
                    .entity(
                            Map.of(
                                    "user",
                                    buildUserResponse(user),
                                    "message",
                                    "Account created successfully. Please log in."))
                    .build();

        } catch (IllegalArgumentException e) {
            log.error("Registration validation error: {}", e.getMessage());
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", e.getMessage()))
                    .build();
        } catch (Exception e) {
            log.error("Registration error for user: {}", username, e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Registration failed: " + e.getMessage()))
                    .build();
        }
    }

    /**
     * Helper method to build user response object
     *
     * @param user User entity
     * @return Map containing user information
     */
    private Map<String, Object> buildUserResponse(User user) {
        Map<String, Object> userMap = new HashMap<>();
        userMap.put("id", user.getId());
        userMap.put("email", user.getUsername()); // Use username as email
        userMap.put("username", user.getUsername());
        userMap.put("role", user.getRolesAsString());
        userMap.put("enabled", user.isEnabled());

        // Add metadata for OAuth compatibility
        Map<String, Object> appMetadata = new HashMap<>();
        appMetadata.put("provider", user.getAuthenticationType()); // Default to email provider
        userMap.put("app_metadata", appMetadata);

        return userMap;
    }

    @DenyDemoUser
    @POST
    @jakarta.ws.rs.Path("/change-username")
    @Audited(type = AuditEventType.USER_PROFILE_UPDATE, level = AuditLevel.BASIC)
    public Response changeUsername(
            @RestForm(value = "currentPasswordChangeUsername") String currentPassword,
            @RestForm(value = "newUsername") String newUsername)
            throws IOException, SQLException, UnsupportedProviderException {
        if (!userService.isUsernameValid(newUsername)) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            Map.of(
                                    "error",
                                    "invalidUsername",
                                    "message",
                                    "Invalid username format"))
                    .build();
        }
        if (securityContext.getUserPrincipal() == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(
                            Map.of(
                                    "error",
                                    "notAuthenticated",
                                    "message",
                                    "User not authenticated"))
                    .build();
        }
        // The username MUST be unique when renaming
        Optional<User> userOpt =
                userService.findByUsername(securityContext.getUserPrincipal().getName());
        if (userOpt == null || userOpt.isEmpty()) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "userNotFound", "message", "User not found"))
                    .build();
        }
        User user = userOpt.get();
        if (user.getUsername().equals(newUsername)) {
            return Response.status(Response.Status.CONFLICT)
                    .entity(Map.of("error", "usernameExists", "message", "Username already in use"))
                    .build();
        }
        if (!userService.isPasswordCorrect(user, currentPassword)) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", "incorrectPassword", "message", "Incorrect password"))
                    .build();
        }
        if (!user.getUsername().equals(newUsername) && userService.usernameExists(newUsername)) {
            return Response.status(Response.Status.CONFLICT)
                    .entity(Map.of("error", "usernameExists", "message", "Username already exists"))
                    .build();
        }
        if (newUsername != null && newUsername.length() > 0) {
            try {
                userService.changeUsername(user, newUsername);
            } catch (IllegalArgumentException e) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(
                                Map.of(
                                        "error",
                                        "invalidUsername",
                                        "message",
                                        "Invalid username format"))
                        .build();
            }
        }
        // TODO: Migration required - Spring's SecurityContextLogoutHandler has no Quarkus
        // equivalent. Session/logout handling must be re-implemented via the migrated session
        // registry (expire the current session) and/or quarkus auth config.
        return Response.ok(
                        Map.of(
                                "message",
                                "credsUpdated",
                                "description",
                                "Username changed successfully. Please log in again."))
                .build();
    }

    @DenyDemoUser
    @POST
    @jakarta.ws.rs.Path("/change-password-on-login")
    @Audited(type = AuditEventType.USER_PROFILE_UPDATE, level = AuditLevel.BASIC)
    public Response changePasswordOnLogin(
            @RestForm(value = "currentPassword") String currentPassword,
            @RestForm(value = "newPassword") String newPassword,
            @RestForm(value = "confirmPassword") String confirmPassword)
            throws SQLException, UnsupportedProviderException {
        if (securityContext.getUserPrincipal() == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(
                            Map.of(
                                    "error",
                                    "notAuthenticated",
                                    "message",
                                    "User not authenticated"))
                    .build();
        }
        Optional<User> userOpt =
                userService.findByUsernameIgnoreCase(securityContext.getUserPrincipal().getName());
        if (userOpt.isEmpty()) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "userNotFound", "message", "User not found"))
                    .build();
        }

        if (currentPassword == null
                || currentPassword.isEmpty()
                || newPassword == null
                || newPassword.isEmpty()
                || confirmPassword == null
                || confirmPassword.isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            Map.of(
                                    "error",
                                    "missingParameters",
                                    "message",
                                    "Current password, new password, and confirmation are"
                                            + " required"))
                    .build();
        }

        if (!newPassword.equals(confirmPassword)) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            Map.of(
                                    "error",
                                    "passwordMismatch",
                                    "message",
                                    "New password and confirmation do not match"))
                    .build();
        }

        if (newPassword.equals(currentPassword)) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            Map.of(
                                    "error",
                                    "passwordUnchanged",
                                    "message",
                                    "New password must be different from the current password"))
                    .build();
        }

        User user = userOpt.get();
        if (!userService.isPasswordCorrect(user, currentPassword)) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", "incorrectPassword", "message", "Incorrect password"))
                    .build();
        }
        // Set flags before changing password so they're saved together
        user.setForcePasswordChange(false);
        userService.changePassword(user, newPassword);
        userService.changeFirstUse(user, false);
        // TODO: Migration required - Spring's SecurityContextLogoutHandler has no Quarkus
        // equivalent. Re-implement logout via the migrated session registry / quarkus auth config.
        return Response.ok(
                        Map.of(
                                "message",
                                "credsUpdated",
                                "description",
                                "Password changed successfully. Please log in again."))
                .build();
    }

    @DenyDemoUser
    @POST
    @jakarta.ws.rs.Path("/change-password")
    @Audited(type = AuditEventType.USER_PROFILE_UPDATE, level = AuditLevel.BASIC)
    public Response changePassword(
            @RestForm(value = "currentPassword") String currentPasswordForm,
            @RestForm(value = "newPassword") String newPasswordForm)
            throws SQLException, UnsupportedProviderException {
        String currentPassword = formOrQuery(currentPasswordForm, "currentPassword");
        String newPassword = formOrQuery(newPasswordForm, "newPassword");
        if (securityContext.getUserPrincipal() == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(
                            Map.of(
                                    "error",
                                    "notAuthenticated",
                                    "message",
                                    "User not authenticated"))
                    .build();
        }
        Optional<User> userOpt =
                userService.findByUsernameIgnoreCase(securityContext.getUserPrincipal().getName());
        if (userOpt.isEmpty()) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "userNotFound", "message", "User not found"))
                    .build();
        }
        User user = userOpt.get();
        if (!userService.isPasswordCorrect(user, currentPassword)) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", "incorrectPassword", "message", "Incorrect password"))
                    .build();
        }
        userService.changePassword(user, newPassword);
        // TODO: Migration required - Spring's SecurityContextLogoutHandler has no Quarkus
        // equivalent. Re-implement logout via the migrated session registry / quarkus auth config.
        return Response.ok(
                        Map.of(
                                "message",
                                "credsUpdated",
                                "description",
                                "Password changed successfully. Please log in again."))
                .build();
    }

    /**
     * Updates the user settings based on the provided JSON payload.
     *
     * @param updates A map containing the settings to update. The expected structure is:
     *     <ul>
     *       <li><b>emailNotifications</b> (optional): "true" or "false" - Enable or disable email
     *           notifications.
     *       <li><b>theme</b> (optional): "light" or "dark" - Set the user's preferred theme.
     *       <li><b>language</b> (optional): A string representing the preferred language (e.g.,
     *           "en", "fr").
     *     </ul>
     *     Keys not listed above will be ignored.
     * @return A Response with success or error information.
     * @throws SQLException If a database error occurs.
     * @throws UnsupportedProviderException If the operation is not supported for the user's
     *     provider.
     */
    @DenyDemoUser
    @POST
    @jakarta.ws.rs.Path("/updateUserSettings")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response updateUserSettings(Map<String, String> updates)
            throws SQLException, UnsupportedProviderException {
        log.debug("Processed updates: {}", updates);
        // Assuming you have a method in userService to update the settings for a user
        userService.updateUserSettings(securityContext.getUserPrincipal().getName(), updates);
        return Response.ok(Map.of("message", "Settings updated successfully")).build();
    }

    @RolesAllowed("ADMIN")
    @POST
    @jakarta.ws.rs.Path("/admin/saveUser")
    public Response saveUser(
            @RestForm(value = "username") String usernameForm,
            @RestForm(value = "password") String passwordForm,
            @RestForm(value = "role") String roleForm,
            @RestForm(value = "teamId") Long teamIdForm,
            @RestForm(value = "authType") String authTypeForm,
            @RestForm(value = "forceChange") Boolean forceChangeForm,
            @RestForm(value = "forceMFA") Boolean forceMFAForm)
            throws IllegalArgumentException, SQLException, UnsupportedProviderException {
        String username = formOrQuery(usernameForm, "username");
        String password = formOrQuery(passwordForm, "password");
        String role = formOrQuery(roleForm, "role");
        Long teamId = formOrQueryLong(teamIdForm, "teamId");
        String authType = formOrQuery(authTypeForm, "authType");
        boolean forceChange = formOrQueryBool(forceChangeForm, "forceChange", false);
        boolean forceMFA = formOrQueryBool(forceMFAForm, "forceMFA", false);
        if (username == null || !userService.isUsernameValid(username)) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            Map.of(
                                    "error",
                                    "Invalid username format. Username must be 3-50 characters."))
                    .build();
        }
        if (licenseSettingsService.wouldExceedLimit(1)) {
            long availableSlots = licenseSettingsService.getAvailableUserSlots();
            int maxAllowed = licenseSettingsService.calculateMaxAllowedUsers();
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            Map.of(
                                    "error",
                                    "Maximum number of users reached. Allowed: "
                                            + maxAllowed
                                            + ", Available slots: "
                                            + availableSlots))
                    .build();
        }
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);
        User user = null;
        if (userOpt.isPresent()) {
            user = userOpt.get();
            if (user.getUsername().equalsIgnoreCase(username)) {
                return Response.status(Response.Status.CONFLICT)
                        .entity(Map.of("error", "Username already exists."))
                        .build();
            }
        }
        if (userService.usernameExistsIgnoreCase(username)) {
            return Response.status(Response.Status.CONFLICT)
                    .entity(Map.of("error", "Username already exists."))
                    .build();
        }
        try {
            // Validate the role
            Role roleEnum = Role.fromString(role);
            if (roleEnum == Role.INTERNAL_API_USER) {
                // If the role is INTERNAL_API_USER, reject the request
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Cannot assign INTERNAL_API_USER role."))
                        .build();
            }
        } catch (IllegalArgumentException e) {
            // If the role ID is not valid, return error
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Invalid role specified."))
                    .build();
        }

        // Use teamId if provided, otherwise use default team
        Long effectiveTeamId = teamId;
        if (effectiveTeamId == null) {
            Team defaultTeam =
                    teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME).orElse(null);
            if (defaultTeam != null) {
                effectiveTeamId = defaultTeam.getId();
            }
        } else {
            // Check if the selected team is Internal - prevent assigning to it
            Team selectedTeam = teamRepository.findByIdOptional(effectiveTeamId).orElse(null);
            if (selectedTeam != null
                    && TeamService.INTERNAL_TEAM_NAME.equals(selectedTeam.getName())) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Cannot assign users to Internal team."))
                        .build();
            }
        }

        SaveUserRequest.Builder builder =
                SaveUserRequest.builder().username(username).teamId(effectiveTeamId).role(role);

        AuthenticationType requestedAuthType;
        if ("SSO".equalsIgnoreCase(authType)) {
            requestedAuthType = AuthenticationType.OAUTH2;
        } else {
            try {
                requestedAuthType = AuthenticationType.valueOf(authType.toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Invalid authentication type specified."))
                        .build();
            }
        }
        builder.authenticationType(requestedAuthType);

        if (requestedAuthType == AuthenticationType.WEB) {
            if (password == null || password.isBlank()) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Password is required."))
                        .build();
            }
            if (password.length() < 6) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Password must be at least 6 characters."))
                        .build();
            }
            builder.password(password).firstLogin(forceChange).requireMfa(forceMFA);
        }
        userService.saveUserCore(builder.build());
        return Response.ok(Map.of("message", "User created successfully")).build();
    }

    @RolesAllowed("ADMIN")
    @POST
    @jakarta.ws.rs.Path("/admin/inviteUsers")
    public Response inviteUsers(
            @RestForm(value = "emails") String emails,
            @RestForm(value = "role") String role,
            @RestForm(value = "teamId") Long teamId,
            @Context HttpServerRequest request)
            throws SQLException, UnsupportedProviderException {

        // Default role when not supplied (was @RequestParam defaultValue = "ROLE_USER").
        if (role == null || role.isEmpty()) {
            role = "ROLE_USER";
        }

        // Check if email invites are enabled
        if (!applicationProperties.getMail().isEnableInvites()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Email invites are not enabled"))
                    .build();
        }

        // Check if email service is available
        if (!emailService.isResolvable()) {
            return Response.status(Response.Status.SERVICE_UNAVAILABLE)
                    .entity(
                            Map.of(
                                    "error",
                                    "Email service is not configured. Please configure SMTP"
                                            + " settings."))
                    .build();
        }

        // Parse comma-separated email addresses
        String[] emailArray = emails.split(",");
        if (emailArray.length == 0) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "At least one email address is required"))
                    .build();
        }

        // Check license limits
        if (licenseSettingsService.wouldExceedLimit(emailArray.length)) {
            long availableSlots = licenseSettingsService.getAvailableUserSlots();
            int maxAllowed = licenseSettingsService.calculateMaxAllowedUsers();
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            Map.of(
                                    "error",
                                    "Not enough user slots available. Allowed: "
                                            + maxAllowed
                                            + ", Available: "
                                            + availableSlots
                                            + ", Requested: "
                                            + emailArray.length))
                    .build();
        }

        // Validate role
        try {
            Role roleEnum = Role.fromString(role);
            if (roleEnum == Role.INTERNAL_API_USER) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Cannot assign INTERNAL_API_USER role"))
                        .build();
            }
        } catch (IllegalArgumentException e) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Invalid role specified"))
                    .build();
        }

        // Determine team
        Long effectiveTeamId = teamId;
        if (effectiveTeamId == null) {
            Team defaultTeam =
                    teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME).orElse(null);
            if (defaultTeam != null) {
                effectiveTeamId = defaultTeam.getId();
            }
        } else {
            Team selectedTeam = teamRepository.findByIdOptional(effectiveTeamId).orElse(null);
            if (selectedTeam != null
                    && TeamService.INTERNAL_TEAM_NAME.equals(selectedTeam.getName())) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Cannot assign users to Internal team"))
                        .build();
            }
        }

        // Build login URL
        String loginUrl = buildLoginUrl(request);

        int successCount = 0;
        int failureCount = 0;
        StringBuilder errors = new StringBuilder();

        // Process each email
        for (String email : emailArray) {
            email = email.trim();
            if (email.isEmpty()) {
                continue;
            }

            InviteResult result = processEmailInvite(email, effectiveTeamId, role, loginUrl);
            if (result.isSuccess()) {
                successCount++;
            } else {
                failureCount++;
                errors.append(result.getErrorMessage()).append("; ");
            }
        }

        Map<String, Object> response = new HashMap<>();
        response.put("successCount", successCount);
        response.put("failureCount", failureCount);

        if (failureCount > 0) {
            response.put("errors", errors.toString());
        }

        if (successCount > 0) {
            response.put("message", successCount + " user(s) invited successfully");
            return Response.ok(response).build();
        } else {
            response.put("error", "Failed to invite any users");
            return Response.status(Response.Status.BAD_REQUEST).entity(response).build();
        }
    }

    @RolesAllowed("ADMIN")
    @POST
    @jakarta.ws.rs.Path("/admin/changeRole")
    @Transactional
    public Response changeRole(
            @RestForm(value = "username") String usernameForm,
            @RestForm(value = "role") String roleForm,
            @RestForm(value = "teamId") Long teamIdForm)
            throws SQLException, UnsupportedProviderException {
        String username = formOrQuery(usernameForm, "username");
        String role = formOrQuery(roleForm, "role");
        Long teamId = formOrQueryLong(teamIdForm, "teamId");
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);
        if (!userOpt.isPresent()) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "User not found."))
                    .build();
        }
        if (!userService.usernameExistsIgnoreCase(username)) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "User not found."))
                    .build();
        }
        // Get the currently authenticated username
        String currentUsername = securityContext.getUserPrincipal().getName();
        // Check if the provided username matches the current session's username
        if (currentUsername.equalsIgnoreCase(username)) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Cannot change your own role."))
                    .build();
        }
        try {
            // Validate the role
            Role roleEnum = Role.fromString(role);
            if (roleEnum == Role.INTERNAL_API_USER) {
                // If the role is INTERNAL_API_USER, reject the request
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Cannot assign INTERNAL_API_USER role."))
                        .build();
            }
        } catch (IllegalArgumentException e) {
            // If the role ID is not valid, return error
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Invalid role specified."))
                    .build();
        }
        User user = userOpt.get();

        // Update the team if a teamId is provided
        if (teamId != null) {
            Team team = teamRepository.findByIdOptional(teamId).orElse(null);
            if (team != null) {
                // Prevent assigning to Internal team
                if (TeamService.INTERNAL_TEAM_NAME.equals(team.getName())) {
                    return Response.status(Response.Status.BAD_REQUEST)
                            .entity(Map.of("error", "Cannot assign users to Internal team."))
                            .build();
                }

                // Prevent moving users from Internal team
                if (user.getTeam() != null
                        && TeamService.INTERNAL_TEAM_NAME.equals(user.getTeam().getName())) {
                    return Response.status(Response.Status.BAD_REQUEST)
                            .entity(Map.of("error", "Cannot move users from Internal team."))
                            .build();
                }

                user.setTeam(team);
                // The user was loaded earlier in this request (detached); Panache persist() rejects
                // a detached entity. Re-attach via merge (the frontend sends teamId here).
                userRepository.getEntityManager().merge(user);
            }
        }

        userService.changeRole(user, role);
        return Response.ok(Map.of("message", "User role updated successfully")).build();
    }

    @RolesAllowed("ADMIN")
    @POST
    @jakarta.ws.rs.Path("/admin/changePasswordForUser")
    public Response changePasswordForUser(
            @RestForm(value = "username") String usernameForm,
            @RestForm(value = "newPassword") String newPasswordForm,
            @RestForm(value = "generateRandom") Boolean generateRandomForm,
            @RestForm(value = "sendEmail") Boolean sendEmailForm,
            @RestForm(value = "includePassword") Boolean includePasswordForm,
            @RestForm(value = "forcePasswordChange") Boolean forcePasswordChangeForm,
            @Context HttpServerRequest request)
            throws SQLException, UnsupportedProviderException, MessagingException {
        String username = formOrQuery(usernameForm, "username");
        String newPassword = formOrQuery(newPasswordForm, "newPassword");
        boolean generateRandom = formOrQueryBool(generateRandomForm, "generateRandom", false);
        boolean sendEmail = formOrQueryBool(sendEmailForm, "sendEmail", false);
        boolean includePassword = formOrQueryBool(includePasswordForm, "includePassword", false);
        boolean forcePasswordChange =
                formOrQueryBool(forcePasswordChangeForm, "forcePasswordChange", false);
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);
        if (userOpt.isEmpty()) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "User not found."))
                    .build();
        }

        String currentUsername = securityContext.getUserPrincipal().getName();
        if (currentUsername.equalsIgnoreCase(username)) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Cannot change your own password."))
                    .build();
        }

        User user = userOpt.get();

        String finalPassword = newPassword;
        if (generateRandom) {
            finalPassword = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        }

        if (finalPassword == null || finalPassword.trim().isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "New password is required."))
                    .build();
        }

        // Set force password change flag before changing password so both are saved together
        user.setForcePasswordChange(forcePasswordChange);
        userService.changePassword(user, finalPassword);

        // Invalidate all active sessions to force reauthentication
        userService.invalidateUserSessions(username);

        if (sendEmail) {
            if (!emailService.isResolvable() || !applicationProperties.getMail().isEnabled()) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Email is not configured."))
                        .build();
            }

            String userEmail = user.getUsername();
            // Check if username is a valid email format
            if (userEmail == null || userEmail.isBlank() || !userEmail.contains("@")) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(
                                Map.of(
                                        "error",
                                        "User's email is not a valid email address. Notifications"
                                                + " are disabled."))
                        .build();
            }

            String loginUrl = buildLoginUrl(request);
            emailService
                    .get()
                    .sendPasswordChangedNotification(
                            userEmail,
                            user.getUsername(),
                            includePassword ? finalPassword : null,
                            loginUrl);
        }

        return Response.ok(Map.of("message", "User password updated successfully")).build();
    }

    @RolesAllowed("ADMIN")
    @POST
    @jakarta.ws.rs.Path("/admin/changeUserEnabled/{username}")
    public Response changeUserEnabled(
            @PathParam("username") String username,
            @RestForm(value = "enabled") Boolean enabledForm)
            throws SQLException, UnsupportedProviderException {
        boolean enabled = formOrQueryBool(enabledForm, "enabled", false);
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);
        if (userOpt.isEmpty()) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "User not found."))
                    .build();
        }
        if (!userService.usernameExistsIgnoreCase(username)) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "User not found."))
                    .build();
        }
        // Get the currently authenticated username
        String currentUsername = securityContext.getUserPrincipal().getName();
        // Check if the provided username matches the current session's username
        if (currentUsername.equalsIgnoreCase(username)) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Cannot disable your own account."))
                    .build();
        }
        User user = userOpt.get();
        userService.changeUserEnabled(user, enabled);
        if (!enabled) {
            // Invalidate all sessions if the user is being disabled
            List<Object> principals = sessionRegistry.getAllPrincipals();
            String userNameP = "";
            for (Object principal : principals) {
                List<SessionInformation> sessionsInformation =
                        sessionRegistry.getAllSessions(principal, false);
                if (principal instanceof UserDetails detailsUser) {
                    userNameP = detailsUser.getUsername();
                } else if (principal instanceof OAuth2User oAuth2User) {
                    userNameP = oAuth2User.getName();
                } else if (principal instanceof CustomSaml2AuthenticatedPrincipal saml2User) {
                    userNameP = saml2User.name();
                } else if (principal instanceof String stringUser) {
                    userNameP = stringUser;
                }
                if (userNameP.equalsIgnoreCase(username)) {
                    for (SessionInformation sessionInfo : sessionsInformation) {
                        sessionRegistry.expireSession(sessionInfo.getSessionId());
                    }
                }
            }
        }
        return Response.ok(
                        Map.of(
                                "message",
                                "User " + (enabled ? "enabled" : "disabled") + " successfully"))
                .build();
    }

    @RolesAllowed("ADMIN")
    @POST
    @jakarta.ws.rs.Path("/admin/unlockUser/{username}")
    @Audited(type = AuditEventType.SETTINGS_CHANGED, level = AuditLevel.BASIC)
    public Response unlockUser(@PathParam("username") String username) {
        loginAttemptService.resetAttempts(username);
        return Response.ok(Map.of("message", "User account unlocked successfully")).build();
    }

    @RolesAllowed("ADMIN")
    @POST
    @jakarta.ws.rs.Path("/admin/deleteUser/{username}")
    @Audited(type = AuditEventType.USER_PROFILE_UPDATE, level = AuditLevel.BASIC)
    public Response deleteUser(@PathParam("username") String username) {
        if (!userService.usernameExistsIgnoreCase(username)) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "User not found."))
                    .build();
        }
        // Get the currently authenticated username
        String currentUsername = securityContext.getUserPrincipal().getName();
        // Check if the provided username matches the current session's username
        if (currentUsername.equalsIgnoreCase(username)) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Cannot delete your own account."))
                    .build();
        }
        // Invalidate all sessions before deleting the user
        List<SessionInformation> sessionsInformations =
                sessionRegistry.getAllSessions(username, false);
        for (SessionInformation sessionsInformation : sessionsInformations) {
            sessionRegistry.expireSession(sessionsInformation.getSessionId());
            sessionRegistry.removeSessionInformation(sessionsInformation.getSessionId());
        }
        userService.deleteUser(username);
        return Response.ok(Map.of("message", "User deleted successfully")).build();
    }

    @DenyDemoUser
    @POST
    @jakarta.ws.rs.Path("/get-api-key")
    public Response getApiKey() {
        if (securityContext.getUserPrincipal() == null) {
            // Unauthenticated -> 401 (Spring's auth entry point returned 401 here, not 403).
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", "User not authenticated."))
                    .build();
        }
        String username = securityContext.getUserPrincipal().getName();
        String apiKey = userService.getApiKeyForUser(username);
        if (apiKey == null) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "API key not found for user."))
                    .build();
        }
        return Response.ok(Map.of("apiKey", apiKey)).build();
    }

    @DenyDemoUser
    @POST
    @jakarta.ws.rs.Path("/update-api-key")
    public Response updateApiKey() {
        if (securityContext.getUserPrincipal() == null) {
            // Unauthenticated -> 401 (Spring's auth entry point returned 401 here, not 403).
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", "User not authenticated."))
                    .build();
        }
        String username = securityContext.getUserPrincipal().getName();
        User user = userService.refreshApiKeyForUser(username);
        String apiKey = user.getApiKey();
        if (apiKey == null) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "API key not found for user."))
                    .build();
        }
        return Response.ok(Map.of("apiKey", apiKey)).build();
    }

    /**
     * Helper method to build the login URL from the application configuration or request.
     *
     * @param request The HTTP request
     * @return The login URL
     */
    private String buildLoginUrl(HttpServerRequest request) {
        String baseUrl;
        String configuredFrontendUrl = applicationProperties.getSystem().getFrontendUrl();
        if (configuredFrontendUrl != null && !configuredFrontendUrl.trim().isEmpty()) {
            // Use configured frontend URL (remove trailing slash if present)
            baseUrl =
                    configuredFrontendUrl.endsWith("/")
                            ? configuredFrontendUrl.substring(0, configuredFrontendUrl.length() - 1)
                            : configuredFrontendUrl;
        } else {
            // Fall back to backend URL from request (RESTEasy Reactive: read scheme/host/port from
            // the Vert.x request instead of the servlet HttpServletRequest).
            String scheme = request.scheme();
            String host = request.authority() != null ? request.authority().host() : "localhost";
            int port = request.authority() != null ? request.authority().port() : -1;
            if (port <= 0) {
                port = "https".equals(scheme) ? 443 : 80;
            }
            baseUrl = scheme + "://" + host + (port != 80 && port != 443 ? ":" + port : "");
        }
        return baseUrl + "/login";
    }

    /**
     * Helper method to process a single email invitation.
     *
     * @param email The email address to invite
     * @param teamId The team ID to assign the user to
     * @param role The role to assign to the user
     * @param loginUrl The URL to the login page
     * @return InviteResult containing success status and optional error message
     */
    private InviteResult processEmailInvite(
            String email, Long teamId, String role, String loginUrl) {
        try {
            // Validate email format (basic check)
            if (!email.contains("@") || !email.contains(".")) {
                return InviteResult.failure(email + ": Invalid email format");
            }

            // Check if user already exists
            if (userService.usernameExistsIgnoreCase(email)) {
                return InviteResult.failure(email + ": User already exists");
            }

            // Generate random password
            String temporaryPassword = java.util.UUID.randomUUID().toString().substring(0, 12);

            // Create user with forceChange=true
            SaveUserRequest.Builder builder =
                    SaveUserRequest.builder()
                            .username(email)
                            .password(temporaryPassword)
                            .teamId(teamId)
                            .role(role)
                            .firstLogin(true);
            userService.saveUserCore(builder.build());

            // Send invite email
            try {
                emailService.get().sendInviteEmail(email, email, temporaryPassword, loginUrl);
                log.info("Sent invite email to: {}", email);
                return InviteResult.success();
            } catch (Exception emailEx) {
                log.error("Failed to send invite email to {}: {}", email, emailEx.getMessage());
                return InviteResult.failure(email + ": User created but email failed to send");
            }

        } catch (Exception e) {
            log.error("Failed to invite user {}: {}", email, e.getMessage());
            return InviteResult.failure(email + ": " + e.getMessage());
        }
    }

    /** Result object for individual email invite processing. */
    private static class InviteResult {
        private final boolean success;
        private final String errorMessage;

        private InviteResult(boolean success, String errorMessage) {
            this.success = success;
            this.errorMessage = errorMessage;
        }

        static InviteResult success() {
            return new InviteResult(true, null);
        }

        static InviteResult failure(String errorMessage) {
            return new InviteResult(false, errorMessage);
        }

        boolean isSuccess() {
            return success;
        }

        String getErrorMessage() {
            return errorMessage;
        }
    }

    @POST
    @jakarta.ws.rs.Path("/complete-initial-setup")
    @Transactional
    public Response completeInitialSetup() {
        try {
            String username = userService.getCurrentUsername();
            if (username == null || "anonymousUser".equalsIgnoreCase(username)) {
                return Response.status(Response.Status.UNAUTHORIZED)
                        .entity("User not authenticated")
                        .build();
            }

            Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);
            if (userOpt.isEmpty()) {
                return Response.status(Response.Status.NOT_FOUND).entity("User not found").build();
            }

            User user = userOpt.get();
            user.setHasCompletedInitialSetup(true);
            // Detached entity (loaded above) -> merge, not persist (see changeRole).
            userRepository.getEntityManager().merge(user);

            log.info("User {} completed initial setup", username);
            return Response.ok(Map.of("success", true)).build();
        } catch (Exception e) {
            log.error("Error completing initial setup", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("Failed to complete initial setup")
                    .build();
        }
    }

    // Lists enabled users for the signing picker; 'org' scope = instance-wide, else caller's team.
    @GET
    @jakarta.ws.rs.Path("/users")
    @Produces(MediaType.APPLICATION_JSON)
    public Response listUsers() {
        if (securityContext.getUserPrincipal() == null) {
            return Response.status(Response.Status.UNAUTHORIZED).build();
        }

        Optional<User> callerOpt =
                userService.findByUsernameIgnoreCase(securityContext.getUserPrincipal().getName());

        // Anonymous (SaaS) accounts must never enumerate users, in any scope or team.
        if (callerOpt.map(UserController::isAnonymousUser).orElse(false)) {
            return Response.status(Response.Status.FORBIDDEN).build();
        }

        // Fail-closed: only literal "org" opens the whole instance; anything else scopes to team.
        String scope = applicationProperties.getStorage().getSigning().getUserListScope();
        boolean teamScoped = !"org".equalsIgnoreCase(scope == null ? "" : scope.trim());

        List<User> source;
        if (teamScoped) {
            Team callerTeam = callerOpt.map(User::getTeam).orElse(null);
            if (callerTeam == null || isSystemTeam(callerTeam)) {
                // No team or a shared system team: return only the caller, not the team's members.
                source = callerOpt.map(List::of).orElse(List.of());
            } else {
                // Scopes via the single User.team FK; revisit if multi-team membership is added.
                source = userRepository.findAllByTeamId(callerTeam.getId());
            }
        } else {
            source = userRepository.findAll().list();
        }

        List<UserSummaryDTO> users =
                source.stream()
                        .filter(User::isEnabled)
                        .map(this::toUserSummaryDTO)
                        .collect(java.util.stream.Collectors.toList());

        return Response.ok(users).build();
    }

    // SaaS anonymous accounts, which must not enumerate users.
    private static boolean isAnonymousUser(User user) {
        return AuthenticationType.ANONYMOUS.name().equalsIgnoreCase(user.getAuthenticationType());
    }

    // System teams (Default/Internal) are not enumerable through the signing picker.
    private static boolean isSystemTeam(Team team) {
        String name = team.getName();
        return TeamService.DEFAULT_TEAM_NAME.equalsIgnoreCase(name)
                || TeamService.INTERNAL_TEAM_NAME.equalsIgnoreCase(name);
    }

    private UserSummaryDTO toUserSummaryDTO(User user) {
        return new UserSummaryDTO(
                user.getId(),
                user.getUsername(),
                user.getUsername(), // Use username as displayName
                user.getTeam() != null ? user.getTeam().getName() : null,
                user.isEnabled());
    }

    // ─── @RequestParam-style binding (query OR form) ──────────────────────────────────────────
    // These restore Spring's @RequestParam union behavior: prefer the value bound from the form
    // body (@RestForm), falling back to the same-named query parameter when the body did not carry
    // it. Keeps the frontend's FormData posts working while also accepting query-string callers.

    private String formOrQuery(String formValue, String name) {
        if (formValue != null) {
            return formValue;
        }
        return uriInfo != null ? uriInfo.getQueryParameters().getFirst(name) : null;
    }

    private Long formOrQueryLong(Long formValue, String name) {
        if (formValue != null) {
            return formValue;
        }
        String raw = uriInfo != null ? uriInfo.getQueryParameters().getFirst(name) : null;
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Long.valueOf(raw.trim());
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private boolean formOrQueryBool(Boolean formValue, String name, boolean defaultValue) {
        if (formValue != null) {
            return formValue;
        }
        String raw = uriInfo != null ? uriInfo.getQueryParameters().getFirst(name) : null;
        return raw != null ? Boolean.parseBoolean(raw.trim()) : defaultValue;
    }
}
