package stirling.software.SPDF.controller.web;

import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2.Client;
import stirling.software.SPDF.model.Authority;
import stirling.software.SPDF.model.Role;
import stirling.software.SPDF.model.User;
import stirling.software.SPDF.model.provider.GithubProvider;
import stirling.software.SPDF.model.provider.GoogleProvider;
import stirling.software.SPDF.model.provider.KeycloakProvider;
import stirling.software.SPDF.repository.UserRepository;

@Controller
@Tag(name = "Account Security", description = "Account Security APIs")
public class AccountWebController {

    @Autowired ApplicationProperties applicationProperties;
    private static final Logger logger = LoggerFactory.getLogger(AccountWebController.class);

    @GetMapping("/login")
    public String login(HttpServletRequest request, Model model, Authentication authentication) {

        if (authentication != null && authentication.isAuthenticated()) {
            return "redirect:/";
        }

        Map<String, String> providerList = new HashMap<>();

        OAUTH2 oauth = applicationProperties.getSecurity().getOAUTH2();
        if (oauth != null) {
            if (oauth.isSettingsValid()) {
                providerList.put("oidc", oauth.getProvider());
            }
            Client client = oauth.getClient();
            if (client != null) {
                GoogleProvider google = client.getGoogle();
                if (google.isSettingsValid()) {
                    providerList.put(google.getName(), google.getClientName());
                }

                GithubProvider github = client.getGithub();
                if (github.isSettingsValid()) {
                    providerList.put(github.getName(), github.getClientName());
                }

                KeycloakProvider keycloak = client.getKeycloak();
                if (keycloak.isSettingsValid()) {
                    providerList.put(keycloak.getName(), keycloak.getClientName());
                }
            }
        }
        // Remove any null keys/values from the providerList
        providerList
                .entrySet()
                .removeIf(entry -> entry.getKey() == null || entry.getValue() == null);
        model.addAttribute("providerlist", providerList);

        model.addAttribute("loginMethod", applicationProperties.getSecurity().getLoginMethod());
        model.addAttribute(
                "oAuth2Enabled", applicationProperties.getSecurity().getOAUTH2().getEnabled());

        model.addAttribute("currentPage", "login");

        String error = request.getParameter("error");
        if (error != null) {

            switch (error) {
                case "badcredentials":
                    error = "login.invalid";
                    break;
                case "locked":
                    error = "login.locked";
                    break;
                case "oauth2AuthenticationError":
                    error = "userAlreadyExistsOAuthMessage";
                    break;
                default:
                    break;
            }

            model.addAttribute("error", error);
        }
        String erroroauth = request.getParameter("erroroauth");
        if (erroroauth != null) {

            switch (erroroauth) {
                case "oauth2AutoCreateDisabled":
                    erroroauth = "login.oauth2AutoCreateDisabled";
                    break;
                case "invalidUsername":
                    erroroauth = "login.invalid";
                    break;
                case "userAlreadyExistsWeb":
                    erroroauth = "userAlreadyExistsWebMessage";
                    break;
                case "oauth2AuthenticationErrorWeb":
                    erroroauth = "login.oauth2InvalidUserType";
                    break;
                case "invalid_token_response":
                    erroroauth = "login.oauth2InvalidTokenResponse";
                    break;
                case "authorization_request_not_found":
                    erroroauth = "login.oauth2RequestNotFound";
                    break;
                case "access_denied":
                    erroroauth = "login.oauth2AccessDenied";
                    break;
                case "invalid_user_info_response":
                    erroroauth = "login.oauth2InvalidUserInfoResponse";
                    break;
                case "invalid_request":
                    erroroauth = "login.oauth2invalidRequest";
                    break;
                case "invalid_id_token":
                    erroroauth = "login.oauth2InvalidIdToken";
                default:
                    break;
            }

            model.addAttribute("erroroauth", erroroauth);
        }
        if (request.getParameter("messageType") != null) {

            model.addAttribute("messageType", "changedCredsMessage");
        }
        if (request.getParameter("logout") != null) {

            model.addAttribute("logoutMessage", "You have been logged out.");
        }

        return "login";
    }

    @Autowired
    private UserRepository userRepository; // Assuming you have a repository for user operations

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @GetMapping("/addUsers")
    public String showAddUserForm(
            HttpServletRequest request, Model model, Authentication authentication) {
        List<User> allUsers = userRepository.findAll();
        Iterator<User> iterator = allUsers.iterator();
        Map<String, String> roleDetails = Role.getAllRoleDetails();

        while (iterator.hasNext()) {
            User user = iterator.next();
            if (user != null) {
                for (Authority authority : user.getAuthorities()) {
                    if (authority.getAuthority().equals(Role.INTERNAL_API_USER.getRoleId())) {
                        iterator.remove();
                        roleDetails.remove(Role.INTERNAL_API_USER.getRoleId());
                        break; // Break out of the inner loop once the user is removed
                    }
                }
            }
        }

        String messageType = request.getParameter("messageType");

        String deleteMessage = null;
        if (messageType != null) {
            switch (messageType) {
                case "deleteCurrentUser":
                    deleteMessage = "deleteCurrentUserMessage";
                    break;
                case "deleteUsernameExists":
                    deleteMessage = "deleteUsernameExistsMessage";
                    break;
                default:
                    break;
            }
            model.addAttribute("deleteMessage", deleteMessage);

            String addMessage = null;
            switch (messageType) {
                case "usernameExists":
                    addMessage = "usernameExistsMessage";
                    break;
                case "invalidUsername":
                    addMessage = "invalidUsernameMessage";
                    break;
                default:
                    break;
            }
            model.addAttribute("addMessage", addMessage);
        }

        String changeMessage = null;
        if (messageType != null) {
            switch (messageType) {
                case "userNotFound":
                    changeMessage = "userNotFoundMessage";
                    break;
                case "downgradeCurrentUser":
                    changeMessage = "downgradeCurrentUserMessage";
                    break;

                default:
                    break;
            }
            model.addAttribute("changeMessage", changeMessage);
        }

        model.addAttribute("users", allUsers);
        model.addAttribute("currentUsername", authentication.getName());
        model.addAttribute("roleDetails", roleDetails);
        return "addUsers";
    }

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @GetMapping("/account")
    public String account(HttpServletRequest request, Model model, Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return "redirect:/";
        }
        if (authentication != null && authentication.isAuthenticated()) {
            Object principal = authentication.getPrincipal();
            String username = null;

            if (principal instanceof UserDetails) {
                // Cast the principal object to UserDetails
                UserDetails userDetails = (UserDetails) principal;

                // Retrieve username and other attributes
                username = userDetails.getUsername();

                // Add oAuth2 Login attributes to the model
                model.addAttribute("oAuth2Login", false);
            }
            if (principal instanceof OAuth2User) {
                // Cast the principal object to OAuth2User
                OAuth2User userDetails = (OAuth2User) principal;

                // Retrieve username and other attributes
                username =
                        userDetails.getAttribute(
                                applicationProperties.getSecurity().getOAUTH2().getUseAsUsername());
                // Add oAuth2 Login attributes to the model
                model.addAttribute("oAuth2Login", true);
            }
            if (username != null) {
                // Fetch user details from the database
                Optional<User> user =
                        userRepository.findByUsernameIgnoreCase(
                                username); // Assuming findByUsername method exists
                if (!user.isPresent()) {
                    return "redirect:/error";
                }

                // Convert settings map to JSON string
                ObjectMapper objectMapper = new ObjectMapper();
                String settingsJson;
                try {
                    settingsJson = objectMapper.writeValueAsString(user.get().getSettings());
                } catch (JsonProcessingException e) {
                    // Handle JSON conversion error
                    logger.error("exception", e);
                    return "redirect:/error";
                }

                String messageType = request.getParameter("messageType");
                if (messageType != null) {
                    switch (messageType) {
                        case "notAuthenticated":
                            messageType = "notAuthenticatedMessage";
                            break;
                        case "userNotFound":
                            messageType = "userNotFoundMessage";
                            break;
                        case "incorrectPassword":
                            messageType = "incorrectPasswordMessage";
                            break;
                        case "usernameExists":
                            messageType = "usernameExistsMessage";
                            break;
                        case "invalidUsername":
                            messageType = "invalidUsernameMessage";
                            break;
                        default:
                            break;
                    }
                    model.addAttribute("messageType", messageType);
                }

                // Add attributes to the model
                model.addAttribute("username", username);
                model.addAttribute("role", user.get().getRolesAsString());
                model.addAttribute("settings", settingsJson);
                model.addAttribute("changeCredsFlag", user.get().isFirstLogin());
                model.addAttribute("currentPage", "account");
            }
        } else {
            return "redirect:/";
        }
        return "account";
    }

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @GetMapping("/change-creds")
    public String changeCreds(
            HttpServletRequest request, Model model, Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return "redirect:/";
        }
        if (authentication != null && authentication.isAuthenticated()) {
            Object principal = authentication.getPrincipal();

            if (principal instanceof UserDetails) {
                // Cast the principal object to UserDetails
                UserDetails userDetails = (UserDetails) principal;

                // Retrieve username and other attributes
                String username = userDetails.getUsername();

                // Fetch user details from the database
                Optional<User> user =
                        userRepository.findByUsernameIgnoreCase(
                                username); // Assuming findByUsername method exists
                if (!user.isPresent()) {
                    // Handle error appropriately
                    return "redirect:/error"; // Example redirection in case of error
                }

                String messageType = request.getParameter("messageType");
                if (messageType != null) {
                    switch (messageType) {
                        case "notAuthenticated":
                            messageType = "notAuthenticatedMessage";
                            break;
                        case "userNotFound":
                            messageType = "userNotFoundMessage";
                            break;
                        case "incorrectPassword":
                            messageType = "incorrectPasswordMessage";
                            break;
                        case "usernameExists":
                            messageType = "usernameExistsMessage";
                            break;
                        default:
                            break;
                    }
                    model.addAttribute("messageType", messageType);
                }

                // Add attributes to the model
                model.addAttribute("username", username);
            }
        } else {
            return "redirect:/";
        }
        return "change-creds";
    }
}
