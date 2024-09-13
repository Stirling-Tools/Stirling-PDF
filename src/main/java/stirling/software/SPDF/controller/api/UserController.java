package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.security.Principal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
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
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.web.servlet.view.RedirectView;

import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import stirling.software.SPDF.config.security.UserService;
import stirling.software.SPDF.config.security.session.SessionPersistentRegistry;
import stirling.software.SPDF.model.AuthenticationType;
import stirling.software.SPDF.model.Role;
import stirling.software.SPDF.model.User;
import stirling.software.SPDF.model.api.user.UsernameAndPass;

@Controller
@Tag(name = "User", description = "User APIs")
@RequestMapping("/api/v1/user")
public class UserController {

    @Autowired private UserService userService;

    @Autowired SessionPersistentRegistry sessionRegistry;

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @PostMapping("/register")
    public String register(@ModelAttribute UsernameAndPass requestModel, Model model)
            throws IOException {
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
            throws IOException {

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
            throws IOException {
        if (principal == null) {
            return new RedirectView("/change-creds?messageType=notAuthenticated", true);
        }

        Optional<User> userOpt = userService.findByUsernameIgnoreCase(principal.getName());

        if (userOpt == null || userOpt.isEmpty()) {
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
            throws IOException {
        if (principal == null) {
            return new RedirectView("/account?messageType=notAuthenticated", true);
        }

        Optional<User> userOpt = userService.findByUsernameIgnoreCase(principal.getName());

        if (userOpt == null || userOpt.isEmpty()) {
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
    public String updateUserSettings(HttpServletRequest request, Principal principal)
            throws IOException {
        Map<String, String[]> paramMap = request.getParameterMap();
        Map<String, String> updates = new HashMap<>();

        System.out.println("Received parameter map: " + paramMap);

        for (Map.Entry<String, String[]> entry : paramMap.entrySet()) {
            updates.put(entry.getKey(), entry.getValue()[0]);
        }

        System.out.println("Processed updates: " + updates);

        // Assuming you have a method in userService to update the settings for a user
        userService.updateUserSettings(principal.getName(), updates);

        return "redirect:/account"; // Redirect to a page of your choice after updating
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/admin/saveUser")
    public RedirectView saveUser(
            @RequestParam(name = "username", required = true) String username,
            @RequestParam(name = "password", required = true) String password,
            @RequestParam(name = "role") String role,
            @RequestParam(name = "authType") String authType,
            @RequestParam(name = "forceChange", required = false, defaultValue = "false")
                    boolean forceChange)
            throws IllegalArgumentException, IOException {

        if (!userService.isUsernameValid(username)) {
            return new RedirectView("/addUsers?messageType=invalidUsername", true);
        }

        Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);

        if (userOpt.isPresent()) {
            User user = userOpt.get();
            if (user != null && user.getUsername().equalsIgnoreCase(username)) {
                return new RedirectView("/addUsers?messageType=usernameExists", true);
            }
        }
        if (userService.usernameExistsIgnoreCase(username)) {
            return new RedirectView("/addUsers?messageType=usernameExists", true);
        }
        try {
            // Validate the role
            Role roleEnum = Role.fromString(role);
            if (roleEnum == Role.INTERNAL_API_USER) {
                // If the role is INTERNAL_API_USER, reject the request
                return new RedirectView("/addUsers?messageType=invalidRole", true);
            }
        } catch (IllegalArgumentException e) {
            // If the role ID is not valid, redirect with an error message
            return new RedirectView("/addUsers?messageType=invalidRole", true);
        }

        if (authType.equalsIgnoreCase(AuthenticationType.OAUTH2.toString())) {
            userService.saveUser(username, AuthenticationType.OAUTH2, role);
        } else {
            if (password.isBlank()) {
                return new RedirectView("/addUsers?messageType=invalidPassword", true);
            }
            userService.saveUser(username, password, role, forceChange);
        }

        return new RedirectView(
                "/addUsers", true); // Redirect to account page after adding the user
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/admin/changeRole")
    public RedirectView changeRole(
            @RequestParam(name = "username") String username,
            @RequestParam(name = "role") String role,
            Authentication authentication)
            throws IOException {

        Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);

        if (!userOpt.isPresent()) {
            return new RedirectView("/addUsers?messageType=userNotFound", true);
        }
        if (!userService.usernameExistsIgnoreCase(username)) {
            return new RedirectView("/addUsers?messageType=userNotFound", true);
        }
        // Get the currently authenticated username
        String currentUsername = authentication.getName();

        // Check if the provided username matches the current session's username
        if (currentUsername.equalsIgnoreCase(username)) {
            return new RedirectView("/addUsers?messageType=downgradeCurrentUser", true);
        }
        try {
            // Validate the role
            Role roleEnum = Role.fromString(role);
            if (roleEnum == Role.INTERNAL_API_USER) {
                // If the role is INTERNAL_API_USER, reject the request
                return new RedirectView("/addUsers?messageType=invalidRole", true);
            }
        } catch (IllegalArgumentException e) {
            // If the role ID is not valid, redirect with an error message
            return new RedirectView("/addUsers?messageType=invalidRole", true);
        }
        User user = userOpt.get();

        userService.changeRole(user, role);

        return new RedirectView(
                "/addUsers", true); // Redirect to account page after adding the user
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/admin/changeUserEnabled/{username}")
    public RedirectView changeUserEnabled(
            @PathVariable("username") String username,
            @RequestParam("enabled") boolean enabled,
            Authentication authentication)
            throws IOException {

        Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);

        if (!userOpt.isPresent()) {
            return new RedirectView("/addUsers?messageType=userNotFound", true);
        }
        if (!userService.usernameExistsIgnoreCase(username)) {
            return new RedirectView("/addUsers?messageType=userNotFound", true);
        }
        // Get the currently authenticated username
        String currentUsername = authentication.getName();

        // Check if the provided username matches the current session's username
        if (currentUsername.equalsIgnoreCase(username)) {
            return new RedirectView("/addUsers?messageType=disabledCurrentUser", true);
        }
        User user = userOpt.get();

        userService.changeUserEnabled(user, enabled);

        if (!enabled) {
            // Invalidate all sessions if the user is being disabled
            List<Object> principals = sessionRegistry.getAllPrincipals();
            String userNameP = "";
            for (Object principal : principals) {
                List<SessionInformation> sessionsInformations =
                        sessionRegistry.getAllSessions(principal, false);
                if (principal instanceof UserDetails) {
                    userNameP = ((UserDetails) principal).getUsername();
                } else if (principal instanceof OAuth2User) {
                    userNameP = ((OAuth2User) principal).getName();
                } else if (principal instanceof String) {
                    userNameP = (String) principal;
                }
                if (userNameP.equalsIgnoreCase(username)) {
                    for (SessionInformation sessionsInformation : sessionsInformations) {
                        sessionRegistry.expireSession(sessionsInformation.getSessionId());
                    }
                }
            }
        }

        return new RedirectView(
                "/addUsers", true); // Redirect to account page after adding the user
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/admin/deleteUser/{username}")
    public RedirectView deleteUser(
            @PathVariable("username") String username, Authentication authentication) {

        if (!userService.usernameExistsIgnoreCase(username)) {
            return new RedirectView("/addUsers?messageType=deleteUsernameExists", true);
        }

        // Get the currently authenticated username
        String currentUsername = authentication.getName();

        // Check if the provided username matches the current session's username
        if (currentUsername.equalsIgnoreCase(username)) {
            return new RedirectView("/addUsers?messageType=deleteCurrentUser", true);
        }

        // Invalidate all sessions before deleting the user
        List<SessionInformation> sessionsInformations =
                sessionRegistry.getAllSessions(authentication.getPrincipal(), false);
        for (SessionInformation sessionsInformation : sessionsInformations) {
            sessionRegistry.expireSession(sessionsInformation.getSessionId());
            sessionRegistry.removeSessionInformation(sessionsInformation.getSessionId());
        }
        userService.deleteUser(username);
        return new RedirectView("/addUsers", true);
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

    private static final String LOGIN_MESSAGETYPE_CREDSUPDATED = "/login?messageType=credsUpdated";
}
