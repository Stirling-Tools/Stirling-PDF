package stirling.software.proprietary.security.controller.api;

import java.io.IOException;
import java.security.Principal;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import jakarta.mail.MessagingException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.transaction.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.UserApi;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.api.user.UsernameAndPass;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.security.service.SaveUserRequest;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;
import stirling.software.proprietary.service.UserLicenseSettingsService;

@UserApi
@Slf4j
@RequiredArgsConstructor
public class UserController {

    private static final String LOGIN_MESSAGETYPE_CREDSUPDATED = "/login?messageType=credsUpdated";
    private final UserService userService;
    private final SessionPersistentRegistry sessionRegistry;
    private final ApplicationProperties applicationProperties;
    private final TeamRepository teamRepository;
    private final UserRepository userRepository;
    private final Optional<EmailService> emailService;
    private final UserLicenseSettingsService licenseSettingsService;

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody UsernameAndPass usernameAndPass)
            throws SQLException, UnsupportedProviderException {
        String username = usernameAndPass.getUsername();
        String password = usernameAndPass.getPassword();
        try {
            log.debug("Registration attempt for user: {}", username);

            if (userService.usernameExistsIgnoreCase(username)) {
                log.warn("Registration failed: username already exists: {}", username);
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "User already exists"));
            }

            if (!userService.isUsernameValid(username)) {
                log.warn("Registration failed: invalid username format: {}", username);
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Invalid username format"));
            }

            if (password == null || password.isEmpty()) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Password is required"));
            }

            if (licenseSettingsService.wouldExceedLimit(1)) {
                long availableSlots = licenseSettingsService.getAvailableUserSlots();
                int maxAllowed = licenseSettingsService.calculateMaxAllowedUsers();
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(
                                Map.of(
                                        "error",
                                        "Maximum number of users reached. Allowed: "
                                                + maxAllowed
                                                + ", Available slots: "
                                                + availableSlots));
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

            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(
                            Map.of(
                                    "user",
                                    buildUserResponse(user),
                                    "message",
                                    "Account created successfully. Please log in."));

        } catch (IllegalArgumentException e) {
            log.error("Registration validation error: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Registration error for user: {}", username, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Registration failed: " + e.getMessage()));
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

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/change-username")
    @Audited(type = AuditEventType.USER_PROFILE_UPDATE, level = AuditLevel.BASIC)
    public ResponseEntity<?> changeUsername(
            Principal principal,
            @RequestParam(name = "currentPasswordChangeUsername") String currentPassword,
            @RequestParam(name = "newUsername") String newUsername,
            HttpServletRequest request,
            HttpServletResponse response)
            throws IOException, SQLException, UnsupportedProviderException {
        if (!userService.isUsernameValid(newUsername)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "invalidUsername", "message", "Invalid username format"));
        }
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "notAuthenticated", "message", "User not authenticated"));
        }
        // The username MUST be unique when renaming
        Optional<User> userOpt = userService.findByUsername(principal.getName());
        if (userOpt == null || userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "userNotFound", "message", "User not found"));
        }
        User user = userOpt.get();
        if (user.getUsername().equals(newUsername)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "usernameExists", "message", "Username already in use"));
        }
        if (!userService.isPasswordCorrect(user, currentPassword)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "incorrectPassword", "message", "Incorrect password"));
        }
        if (!user.getUsername().equals(newUsername) && userService.usernameExists(newUsername)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "usernameExists", "message", "Username already exists"));
        }
        if (newUsername != null && newUsername.length() > 0) {
            try {
                userService.changeUsername(user, newUsername);
            } catch (IllegalArgumentException e) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(
                                Map.of(
                                        "error",
                                        "invalidUsername",
                                        "message",
                                        "Invalid username format"));
            }
        }
        // Logout using Spring's utility
        new SecurityContextLogoutHandler().logout(request, response, null);
        return ResponseEntity.ok(
                Map.of(
                        "message",
                        "credsUpdated",
                        "description",
                        "Username changed successfully. Please log in again."));
    }

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/change-password-on-login")
    @Audited(type = AuditEventType.USER_PROFILE_UPDATE, level = AuditLevel.BASIC)
    public ResponseEntity<?> changePasswordOnLogin(
            Principal principal,
            @RequestParam(name = "currentPassword") String currentPassword,
            @RequestParam(name = "newPassword") String newPassword,
            @RequestParam(name = "confirmPassword") String confirmPassword,
            HttpServletRequest request,
            HttpServletResponse response)
            throws SQLException, UnsupportedProviderException {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "notAuthenticated", "message", "User not authenticated"));
        }
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(principal.getName());
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "userNotFound", "message", "User not found"));
        }

        if (currentPassword == null
                || currentPassword.isEmpty()
                || newPassword == null
                || newPassword.isEmpty()
                || confirmPassword == null
                || confirmPassword.isEmpty()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(
                            Map.of(
                                    "error",
                                    "missingParameters",
                                    "message",
                                    "Current password, new password, and confirmation are"
                                            + " required"));
        }

        if (!newPassword.equals(confirmPassword)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(
                            Map.of(
                                    "error",
                                    "passwordMismatch",
                                    "message",
                                    "New password and confirmation do not match"));
        }

        if (newPassword.equals(currentPassword)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(
                            Map.of(
                                    "error",
                                    "passwordUnchanged",
                                    "message",
                                    "New password must be different from the current password"));
        }

        User user = userOpt.get();
        if (!userService.isPasswordCorrect(user, currentPassword)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "incorrectPassword", "message", "Incorrect password"));
        }
        // Set flags before changing password so they're saved together
        user.setForcePasswordChange(false);
        userService.changePassword(user, newPassword);
        userService.changeFirstUse(user, false);
        // Logout using Spring's utility
        new SecurityContextLogoutHandler().logout(request, response, null);
        return ResponseEntity.ok(
                Map.of(
                        "message",
                        "credsUpdated",
                        "description",
                        "Password changed successfully. Please log in again."));
    }

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/change-password")
    @Audited(type = AuditEventType.USER_PROFILE_UPDATE, level = AuditLevel.BASIC)
    public ResponseEntity<?> changePassword(
            Principal principal,
            @RequestParam(name = "currentPassword") String currentPassword,
            @RequestParam(name = "newPassword") String newPassword,
            HttpServletRequest request,
            HttpServletResponse response)
            throws SQLException, UnsupportedProviderException {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "notAuthenticated", "message", "User not authenticated"));
        }
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(principal.getName());
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "userNotFound", "message", "User not found"));
        }
        User user = userOpt.get();
        if (!userService.isPasswordCorrect(user, currentPassword)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "incorrectPassword", "message", "Incorrect password"));
        }
        userService.changePassword(user, newPassword);
        // Logout using Spring's utility
        new SecurityContextLogoutHandler().logout(request, response, null);
        return ResponseEntity.ok(
                Map.of(
                        "message",
                        "credsUpdated",
                        "description",
                        "Password changed successfully. Please log in again."));
    }

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/updateUserSettings")
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
     * @param principal The currently authenticated user.
     * @return A ResponseEntity with success or error information.
     * @throws SQLException If a database error occurs.
     * @throws UnsupportedProviderException If the operation is not supported for the user's
     *     provider.
     */
    public ResponseEntity<?> updateUserSettings(
            @RequestBody Map<String, String> updates, Principal principal)
            throws SQLException, UnsupportedProviderException {
        log.debug("Processed updates: {}", updates);
        // Assuming you have a method in userService to update the settings for a user
        userService.updateUserSettings(principal.getName(), updates);
        return ResponseEntity.ok(Map.of("message", "Settings updated successfully"));
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/admin/saveUser")
    public ResponseEntity<?> saveUser(
            @RequestParam(name = "username", required = true) String username,
            @RequestParam(name = "password", required = false) String password,
            @RequestParam(name = "role") String role,
            @RequestParam(name = "teamId", required = false) Long teamId,
            @RequestParam(name = "authType") String authType,
            @RequestParam(name = "forceChange", required = false, defaultValue = "false")
                    boolean forceChange,
            @RequestParam(name = "forceMFA", required = false, defaultValue = "false")
                    boolean forceMFA)
            throws IllegalArgumentException, SQLException, UnsupportedProviderException {
        if (!userService.isUsernameValid(username)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(
                            Map.of(
                                    "error",
                                    "Invalid username format. Username must be 3-50 characters."));
        }
        if (licenseSettingsService.wouldExceedLimit(1)) {
            long availableSlots = licenseSettingsService.getAvailableUserSlots();
            int maxAllowed = licenseSettingsService.calculateMaxAllowedUsers();
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(
                            Map.of(
                                    "error",
                                    "Maximum number of users reached. Allowed: "
                                            + maxAllowed
                                            + ", Available slots: "
                                            + availableSlots));
        }
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);
        User user = null;
        if (userOpt.isPresent()) {
            user = userOpt.get();
            if (user.getUsername().equalsIgnoreCase(username)) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("error", "Username already exists."));
            }
        }
        if (userService.usernameExistsIgnoreCase(username)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Username already exists."));
        }
        try {
            // Validate the role
            Role roleEnum = Role.fromString(role);
            if (roleEnum == Role.INTERNAL_API_USER) {
                // If the role is INTERNAL_API_USER, reject the request
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Cannot assign INTERNAL_API_USER role."));
            }
        } catch (IllegalArgumentException e) {
            // If the role ID is not valid, return error
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Invalid role specified."));
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
            Team selectedTeam = teamRepository.findById(effectiveTeamId).orElse(null);
            if (selectedTeam != null
                    && TeamService.INTERNAL_TEAM_NAME.equals(selectedTeam.getName())) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Cannot assign users to Internal team."));
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
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Invalid authentication type specified."));
            }
        }
        builder.authenticationType(requestedAuthType);

        if (requestedAuthType == AuthenticationType.WEB) {
            if (password == null || password.isBlank()) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Password is required."));
            }
            if (password.length() < 6) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Password must be at least 6 characters."));
            }
            builder.password(password).firstLogin(forceChange).requireMfa(forceMFA);
        }
        userService.saveUserCore(builder.build());
        return ResponseEntity.ok(Map.of("message", "User created successfully"));
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/admin/inviteUsers")
    public ResponseEntity<?> inviteUsers(
            @RequestParam(name = "emails", required = true) String emails,
            @RequestParam(name = "role", defaultValue = "ROLE_USER") String role,
            @RequestParam(name = "teamId", required = false) Long teamId,
            HttpServletRequest request)
            throws SQLException, UnsupportedProviderException {

        // Check if email invites are enabled
        if (!applicationProperties.getMail().isEnableInvites()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Email invites are not enabled"));
        }

        // Check if email service is available
        if (!emailService.isPresent()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(
                            Map.of(
                                    "error",
                                    "Email service is not configured. Please configure SMTP"
                                            + " settings."));
        }

        // Parse comma-separated email addresses
        String[] emailArray = emails.split(",");
        if (emailArray.length == 0) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "At least one email address is required"));
        }

        // Check license limits
        if (licenseSettingsService.wouldExceedLimit(emailArray.length)) {
            long availableSlots = licenseSettingsService.getAvailableUserSlots();
            int maxAllowed = licenseSettingsService.calculateMaxAllowedUsers();
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(
                            Map.of(
                                    "error",
                                    "Not enough user slots available. Allowed: "
                                            + maxAllowed
                                            + ", Available: "
                                            + availableSlots
                                            + ", Requested: "
                                            + emailArray.length));
        }

        // Validate role
        try {
            Role roleEnum = Role.fromString(role);
            if (roleEnum == Role.INTERNAL_API_USER) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Cannot assign INTERNAL_API_USER role"));
            }
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Invalid role specified"));
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
            Team selectedTeam = teamRepository.findById(effectiveTeamId).orElse(null);
            if (selectedTeam != null
                    && TeamService.INTERNAL_TEAM_NAME.equals(selectedTeam.getName())) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Cannot assign users to Internal team"));
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
            return ResponseEntity.ok(response);
        } else {
            response.put("error", "Failed to invite any users");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
        }
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/admin/changeRole")
    @Transactional
    public ResponseEntity<?> changeRole(
            @RequestParam(name = "username") String username,
            @RequestParam(name = "role") String role,
            @RequestParam(name = "teamId", required = false) Long teamId,
            Authentication authentication)
            throws SQLException, UnsupportedProviderException {
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);
        if (!userOpt.isPresent()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "User not found."));
        }
        if (!userService.usernameExistsIgnoreCase(username)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "User not found."));
        }
        // Get the currently authenticated username
        String currentUsername = authentication.getName();
        // Check if the provided username matches the current session's username
        if (currentUsername.equalsIgnoreCase(username)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Cannot change your own role."));
        }
        try {
            // Validate the role
            Role roleEnum = Role.fromString(role);
            if (roleEnum == Role.INTERNAL_API_USER) {
                // If the role is INTERNAL_API_USER, reject the request
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Cannot assign INTERNAL_API_USER role."));
            }
        } catch (IllegalArgumentException e) {
            // If the role ID is not valid, return error
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Invalid role specified."));
        }
        User user = userOpt.get();

        // Update the team if a teamId is provided
        if (teamId != null) {
            Team team = teamRepository.findById(teamId).orElse(null);
            if (team != null) {
                // Prevent assigning to Internal team
                if (TeamService.INTERNAL_TEAM_NAME.equals(team.getName())) {
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                            .body(Map.of("error", "Cannot assign users to Internal team."));
                }

                // Prevent moving users from Internal team
                if (user.getTeam() != null
                        && TeamService.INTERNAL_TEAM_NAME.equals(user.getTeam().getName())) {
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                            .body(Map.of("error", "Cannot move users from Internal team."));
                }

                user.setTeam(team);
                userRepository.save(user);
            }
        }

        userService.changeRole(user, role);
        return ResponseEntity.ok(Map.of("message", "User role updated successfully"));
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/admin/changePasswordForUser")
    public ResponseEntity<?> changePasswordForUser(
            @RequestParam(name = "username") String username,
            @RequestParam(name = "newPassword", required = false) String newPassword,
            @RequestParam(name = "generateRandom", defaultValue = "false") boolean generateRandom,
            @RequestParam(name = "sendEmail", defaultValue = "false") boolean sendEmail,
            @RequestParam(name = "includePassword", defaultValue = "false") boolean includePassword,
            @RequestParam(name = "forcePasswordChange", defaultValue = "false")
                    boolean forcePasswordChange,
            HttpServletRequest request,
            Authentication authentication)
            throws SQLException, UnsupportedProviderException, MessagingException {
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "User not found."));
        }

        String currentUsername = authentication.getName();
        if (currentUsername.equalsIgnoreCase(username)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Cannot change your own password."));
        }

        User user = userOpt.get();

        String finalPassword = newPassword;
        if (generateRandom) {
            finalPassword = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        }

        if (finalPassword == null || finalPassword.trim().isEmpty()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "New password is required."));
        }

        // Set force password change flag before changing password so both are saved together
        user.setForcePasswordChange(forcePasswordChange);
        userService.changePassword(user, finalPassword);

        // Invalidate all active sessions to force reauthentication
        userService.invalidateUserSessions(username);

        if (sendEmail) {
            if (emailService.isEmpty() || !applicationProperties.getMail().isEnabled()) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Email is not configured."));
            }

            String userEmail = user.getUsername();
            // Check if username is a valid email format
            if (userEmail == null || userEmail.isBlank() || !userEmail.contains("@")) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(
                                Map.of(
                                        "error",
                                        "User's email is not a valid email address. Notifications"
                                                + " are disabled."));
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

        return ResponseEntity.ok(Map.of("message", "User password updated successfully"));
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/admin/changeUserEnabled/{username}")
    public ResponseEntity<?> changeUserEnabled(
            @PathVariable("username") String username,
            @RequestParam("enabled") boolean enabled,
            Authentication authentication)
            throws SQLException, UnsupportedProviderException {
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "User not found."));
        }
        if (!userService.usernameExistsIgnoreCase(username)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "User not found."));
        }
        // Get the currently authenticated username
        String currentUsername = authentication.getName();
        // Check if the provided username matches the current session's username
        if (currentUsername.equalsIgnoreCase(username)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Cannot disable your own account."));
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
        return ResponseEntity.ok(
                Map.of("message", "User " + (enabled ? "enabled" : "disabled") + " successfully"));
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/admin/deleteUser/{username}")
    public ResponseEntity<?> deleteUser(
            @PathVariable("username") String username, Authentication authentication) {
        if (!userService.usernameExistsIgnoreCase(username)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "User not found."));
        }
        // Get the currently authenticated username
        String currentUsername = authentication.getName();
        // Check if the provided username matches the current session's username
        if (currentUsername.equalsIgnoreCase(username)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Cannot delete your own account."));
        }
        // Invalidate all sessions before deleting the user
        List<SessionInformation> sessionsInformations =
                sessionRegistry.getAllSessions(username, false);
        for (SessionInformation sessionsInformation : sessionsInformations) {
            sessionRegistry.expireSession(sessionsInformation.getSessionId());
            sessionRegistry.removeSessionInformation(sessionsInformation.getSessionId());
        }
        userService.deleteUser(username);
        return ResponseEntity.ok(Map.of("message", "User deleted successfully"));
    }

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/get-api-key")
    public ResponseEntity<Map<String, String>> getApiKey(Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "User not authenticated."));
        }
        String username = principal.getName();
        String apiKey = userService.getApiKeyForUser(username);
        if (apiKey == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "API key not found for user."));
        }
        return ResponseEntity.ok(Map.of("apiKey", apiKey));
    }

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/update-api-key")
    public ResponseEntity<Map<String, String>> updateApiKey(Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "User not authenticated."));
        }
        String username = principal.getName();
        User user = userService.refreshApiKeyForUser(username);
        String apiKey = user.getApiKey();
        if (apiKey == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "API key not found for user."));
        }
        return ResponseEntity.ok(Map.of("apiKey", apiKey));
    }

    /**
     * Helper method to build the login URL from the application configuration or request.
     *
     * @param request The HTTP request
     * @return The login URL
     */
    private String buildLoginUrl(HttpServletRequest request) {
        String baseUrl;
        String configuredFrontendUrl = applicationProperties.getSystem().getFrontendUrl();
        if (configuredFrontendUrl != null && !configuredFrontendUrl.trim().isEmpty()) {
            // Use configured frontend URL (remove trailing slash if present)
            baseUrl =
                    configuredFrontendUrl.endsWith("/")
                            ? configuredFrontendUrl.substring(0, configuredFrontendUrl.length() - 1)
                            : configuredFrontendUrl;
        } else {
            // Fall back to backend URL from request
            baseUrl =
                    request.getScheme()
                            + "://"
                            + request.getServerName()
                            + (request.getServerPort() != 80 && request.getServerPort() != 443
                                    ? ":" + request.getServerPort()
                                    : "");
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

    @PostMapping("/complete-initial-setup")
    public ResponseEntity<?> completeInitialSetup() {
        try {
            String username = userService.getCurrentUsername();
            if (username == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body("User not authenticated");
            }

            Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);
            if (userOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body("User not found");
            }

            User user = userOpt.get();
            user.setHasCompletedInitialSetup(true);
            userRepository.save(user);

            log.info("User {} completed initial setup", username);
            return ResponseEntity.ok().body(Map.of("success", true));
        } catch (Exception e) {
            log.error("Error completing initial setup", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to complete initial setup");
        }
    }
}
