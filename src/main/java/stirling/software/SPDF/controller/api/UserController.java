package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.security.Principal;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.web.servlet.view.RedirectView;

import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.security.UserService;
import stirling.software.SPDF.config.security.saml2.CustomSaml2AuthenticatedPrincipal;
import stirling.software.SPDF.config.security.session.SessionPersistentRegistry;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.AuthenticationType;
import stirling.software.SPDF.model.Role;
import stirling.software.SPDF.model.User;
import stirling.software.SPDF.model.api.user.UsernameAndPass;
import stirling.software.SPDF.model.exception.UnsupportedProviderException;

@Controller
@Tag(name = "User", description = "User APIs")
@RequestMapping("/api/v1/user")
@Slf4j
@RequiredArgsConstructor
public class UserController {

    private static final String LOGIN_MESSAGETYPE_CREDSUPDATED = "/login?messageType=credsUpdated";
    private final UserService userService;
    private final SessionPersistentRegistry sessionRegistry;
    private final ApplicationProperties applicationProperties;

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/register")
    public String register(@ModelAttribute UsernameAndPass requestModel, Model model)
            throws SQLException, UnsupportedProviderException {
        if (userService.usernameExistsIgnoreCase(requestModel.getUsername())) {
            model.addAttribute("error", "Username already exists");
            return "register";
        }
        try {
            userService.saveUser(requestModel.getUsername(), requestModel.getPassword());
        } catch (IllegalArgumentException e) {
            return "redirect:/login?messageType=invalidUsername";
        }
        return "redirect:/login?registered=true";
    }

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/change-username")
    public RedirectView changeUsername(
            Principal principal,
            @RequestParam(name = "currentPasswordChangeUsername") String currentPassword,
            @RequestParam(name = "newUsername") String newUsername,
            HttpServletRequest request,
            HttpServletResponse response,
            RedirectAttributes redirectAttributes)
            throws IOException, SQLException, UnsupportedProviderException {
        if (!userService.isUsernameValid(newUsername)) {
            return new RedirectView("/account?messageType=invalidUsername", true);
        }
        if (principal == null) {
            return new RedirectView("/account?messageType=notAuthenticated", true);
        }
        // The username MUST be unique when renaming
        Optional<User> userOpt = userService.findByUsername(principal.getName());
        if (userOpt == null || userOpt.isEmpty()) {
            return new RedirectView("/account?messageType=userNotFound", true);
        }
        User user = userOpt.get();
        if (user.getUsername().equals(newUsername)) {
            return new RedirectView("/account?messageType=usernameExists", true);
        }
        if (!userService.isPasswordCorrect(user, currentPassword)) {
            return new RedirectView("/account?messageType=incorrectPassword", true);
        }
        if (!user.getUsername().equals(newUsername) && userService.usernameExists(newUsername)) {
            return new RedirectView("/account?messageType=usernameExists", true);
        }
        if (newUsername != null && newUsername.length() > 0) {
            try {
                userService.changeUsername(user, newUsername);
            } catch (IllegalArgumentException e) {
                return new RedirectView("/account?messageType=invalidUsername", true);
            }
        }
        // Logout using Spring's utility
        new SecurityContextLogoutHandler().logout(request, response, null);
        return new RedirectView(LOGIN_MESSAGETYPE_CREDSUPDATED, true);
    }

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/change-password-on-login")
    public RedirectView changePasswordOnLogin(
            Principal principal,
            @RequestParam(name = "currentPassword") String currentPassword,
            @RequestParam(name = "newPassword") String newPassword,
            HttpServletRequest request,
            HttpServletResponse response,
            RedirectAttributes redirectAttributes)
            throws SQLException, UnsupportedProviderException {
        if (principal == null) {
            return new RedirectView("/change-creds?messageType=notAuthenticated", true);
        }
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(principal.getName());
        if (userOpt.isEmpty()) {
            return new RedirectView("/change-creds?messageType=userNotFound", true);
        }
        User user = userOpt.get();
        if (!userService.isPasswordCorrect(user, currentPassword)) {
            return new RedirectView("/change-creds?messageType=incorrectPassword", true);
        }
        userService.changePassword(user, newPassword);
        userService.changeFirstUse(user, false);
        // Logout using Spring's utility
        new SecurityContextLogoutHandler().logout(request, response, null);
        return new RedirectView(LOGIN_MESSAGETYPE_CREDSUPDATED, true);
    }

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/change-password")
    public RedirectView changePassword(
            Principal principal,
            @RequestParam(name = "currentPassword") String currentPassword,
            @RequestParam(name = "newPassword") String newPassword,
            HttpServletRequest request,
            HttpServletResponse response,
            RedirectAttributes redirectAttributes)
            throws SQLException, UnsupportedProviderException {
        if (principal == null) {
            return new RedirectView("/account?messageType=notAuthenticated", true);
        }
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(principal.getName());
        if (userOpt.isEmpty()) {
            return new RedirectView("/account?messageType=userNotFound", true);
        }
        User user = userOpt.get();
        if (!userService.isPasswordCorrect(user, currentPassword)) {
            return new RedirectView("/account?messageType=incorrectPassword", true);
        }
        userService.changePassword(user, newPassword);
        // Logout using Spring's utility
        new SecurityContextLogoutHandler().logout(request, response, null);
        return new RedirectView(LOGIN_MESSAGETYPE_CREDSUPDATED, true);
    }

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/updateUserSettings")
    /**
     * Updates the user settings based on the provided JSON payload.
     *
     * @param updates A map containing the settings to update. The expected structure is:
     *                <ul>
     *                  <li><b>emailNotifications</b> (optional): "true" or "false" - Enable or disable email notifications.</li>
     *                  <li><b>theme</b> (optional): "light" or "dark" - Set the user's preferred theme.</li>
     *                  <li><b>language</b> (optional): A string representing the preferred language (e.g., "en", "fr").</li>
     *                </ul>
     *                Keys not listed above will be ignored.
     * @param principal The currently authenticated user.
     * @return A redirect string to the account page after updating the settings.
     * @throws SQLException If a database error occurs.
     * @throws UnsupportedProviderException If the operation is not supported for the user's provider.
     */
    public String updateUserSettings(@RequestBody Map<String, String> updates, Principal principal)
            throws SQLException, UnsupportedProviderException {
        log.debug("Processed updates: {}", updates);
        // Assuming you have a method in userService to update the settings for a user
        userService.updateUserSettings(principal.getName(), updates);
        // Redirect to a page of your choice after updating
        return "redirect:/account";
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/admin/saveUser")
    public RedirectView saveUser(
            @RequestParam(name = "username", required = true) String username,
            @RequestParam(name = "password", required = false) String password,
            @RequestParam(name = "role") String role,
            @RequestParam(name = "authType") String authType,
            @RequestParam(name = "forceChange", required = false, defaultValue = "false")
                    boolean forceChange)
            throws IllegalArgumentException, SQLException, UnsupportedProviderException {
        if (!userService.isUsernameValid(username)) {
            return new RedirectView("/adminSettings?messageType=invalidUsername", true);
        }
        if (applicationProperties.getPremium().isEnabled()
                && applicationProperties.getPremium().getMaxUsers()
                        <= userService.getTotalUsersCount()) {
            return new RedirectView("/adminSettings?messageType=maxUsersReached", true);
        }
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            if (user.getUsername().equalsIgnoreCase(username)) {
                return new RedirectView("/adminSettings?messageType=usernameExists", true);
            }
        }
        if (userService.usernameExistsIgnoreCase(username)) {
            return new RedirectView("/adminSettings?messageType=usernameExists", true);
        }
        try {
            // Validate the role
            Role roleEnum = Role.fromString(role);
            if (roleEnum == Role.INTERNAL_API_USER) {
                // If the role is INTERNAL_API_USER, reject the request
                return new RedirectView("/adminSettings?messageType=invalidRole", true);
            }
        } catch (IllegalArgumentException e) {
            // If the role ID is not valid, redirect with an error message
            return new RedirectView("/adminSettings?messageType=invalidRole", true);
        }
        if (authType.equalsIgnoreCase(AuthenticationType.SSO.toString())) {
            userService.saveUser(username, AuthenticationType.SSO, role);
        } else {
            if (password.isBlank()) {
                return new RedirectView("/adminSettings?messageType=invalidPassword", true);
            }
            userService.saveUser(username, password, role, forceChange);
        }
        return new RedirectView(
                "/adminSettings", // Redirect to account page after adding the user
                true);
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/admin/changeRole")
    public RedirectView changeRole(
            @RequestParam(name = "username") String username,
            @RequestParam(name = "role") String role,
            Authentication authentication)
            throws SQLException, UnsupportedProviderException {
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);
        if (!userOpt.isPresent()) {
            return new RedirectView("/adminSettings?messageType=userNotFound", true);
        }
        if (!userService.usernameExistsIgnoreCase(username)) {
            return new RedirectView("/adminSettings?messageType=userNotFound", true);
        }
        // Get the currently authenticated username
        String currentUsername = authentication.getName();
        // Check if the provided username matches the current session's username
        if (currentUsername.equalsIgnoreCase(username)) {
            return new RedirectView("/adminSettings?messageType=downgradeCurrentUser", true);
        }
        try {
            // Validate the role
            Role roleEnum = Role.fromString(role);
            if (roleEnum == Role.INTERNAL_API_USER) {
                // If the role is INTERNAL_API_USER, reject the request
                return new RedirectView("/adminSettings?messageType=invalidRole", true);
            }
        } catch (IllegalArgumentException e) {
            // If the role ID is not valid, redirect with an error message
            return new RedirectView("/adminSettings?messageType=invalidRole", true);
        }
        User user = userOpt.get();
        userService.changeRole(user, role);
        return new RedirectView(
                "/adminSettings", // Redirect to account page after adding the user
                true);
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/admin/changeUserEnabled/{username}")
    public RedirectView changeUserEnabled(
            @PathVariable("username") String username,
            @RequestParam("enabled") boolean enabled,
            Authentication authentication)
            throws SQLException, UnsupportedProviderException {
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);
        if (userOpt.isEmpty()) {
            return new RedirectView("/adminSettings?messageType=userNotFound", true);
        }
        if (!userService.usernameExistsIgnoreCase(username)) {
            return new RedirectView("/adminSettings?messageType=userNotFound", true);
        }
        // Get the currently authenticated username
        String currentUsername = authentication.getName();
        // Check if the provided username matches the current session's username
        if (currentUsername.equalsIgnoreCase(username)) {
            return new RedirectView("/adminSettings?messageType=disabledCurrentUser", true);
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
        return new RedirectView(
                "/adminSettings", // Redirect to account page after adding the user
                true);
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/admin/deleteUser/{username}")
    public RedirectView deleteUser(
            @PathVariable("username") String username, Authentication authentication) {
        if (!userService.usernameExistsIgnoreCase(username)) {
            return new RedirectView("/adminSettings?messageType=deleteUsernameExists", true);
        }
        // Get the currently authenticated username
        String currentUsername = authentication.getName();
        // Check if the provided username matches the current session's username
        if (currentUsername.equalsIgnoreCase(username)) {
            return new RedirectView("/adminSettings?messageType=deleteCurrentUser", true);
        }
        // Invalidate all sessions before deleting the user
        List<SessionInformation> sessionsInformations =
                sessionRegistry.getAllSessions(username, false);
        for (SessionInformation sessionsInformation : sessionsInformations) {
            sessionRegistry.expireSession(sessionsInformation.getSessionId());
            sessionRegistry.removeSessionInformation(sessionsInformation.getSessionId());
        }
        userService.deleteUser(username);
        return new RedirectView("/adminSettings", true);
    }

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/get-api-key")
    public ResponseEntity<String> getApiKey(Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("User not authenticated.");
        }
        String username = principal.getName();
        String apiKey = userService.getApiKeyForUser(username);
        if (apiKey == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("API key not found for user.");
        }
        return ResponseEntity.ok(apiKey);
    }

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/update-api-key")
    public ResponseEntity<String> updateApiKey(Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("User not authenticated.");
        }
        String username = principal.getName();
        User user = userService.refreshApiKeyForUser(username);
        String apiKey = user.getApiKey();
        if (apiKey == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("API key not found for user.");
        }
        return ResponseEntity.ok(apiKey);
    }
}
