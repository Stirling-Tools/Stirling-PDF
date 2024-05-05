package stirling.software.SPDF.controller.web;

import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

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
import stirling.software.SPDF.model.Authority;
import stirling.software.SPDF.model.Role;
import stirling.software.SPDF.model.User;
import stirling.software.SPDF.repository.UserRepository;

@Controller
@Tag(name = "Account Security", description = "Account Security APIs")
public class AccountWebController {

    @Autowired ApplicationProperties applicationProperties;

    @GetMapping("/login")
    public String login(HttpServletRequest request, Model model, Authentication authentication) {
        if (authentication != null && authentication.isAuthenticated()) {
            return "redirect:/";
        }

        model.addAttribute(
                "oAuth2Enabled", applicationProperties.getSecurity().getOAUTH2().getEnabled());

        model.addAttribute("currentPage", "login");

        if (request.getParameter("error") != null) {

            model.addAttribute("error", request.getParameter("error"));
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
    public String showAddUserForm(Model model, Authentication authentication) {
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
                username = userDetails.getAttribute("email");

                // Add oAuth2 Login attributes to the model
                model.addAttribute("oAuth2Login", true);
            }
            if (username != null) {
                // Fetch user details from the database
                Optional<User> user =
                        userRepository.findByUsernameIgnoreCase(
                                username); // Assuming findByUsername method exists
                if (!user.isPresent()) {
                    // Handle error appropriately
                    return "redirect:/error"; // Example redirection in case of error
                }

                // Convert settings map to JSON string
                ObjectMapper objectMapper = new ObjectMapper();
                String settingsJson;
                try {
                    settingsJson = objectMapper.writeValueAsString(user.get().getSettings());
                } catch (JsonProcessingException e) {
                    // Handle JSON conversion error
                    e.printStackTrace();
                    return "redirect:/error"; // Example redirection in case of error
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
                // Add attributes to the model
                model.addAttribute("username", username);
            }
        } else {
            return "redirect:/";
        }
        return "change-creds";
    }
}
