package stirling.software.SPDF.controller.web;

import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;
import stirling.software.SPDF.model.Authority;
import stirling.software.SPDF.model.Role;
import stirling.software.SPDF.model.User;
import stirling.software.SPDF.repository.UserRepository;

@Controller
@Tag(name = "Account Security", description = "Account Security APIs")
public class AccountWebController {

    private final UserRepository userRepository;

    @Autowired
    public AccountWebController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/login")
    public String login(HttpServletRequest request, Model model, Authentication authentication) {
        if (isAuthenticated(authentication)) {
            return "redirect:/";
        }

        addLoginAttributes(request, model);

        return "login";
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @GetMapping("/addUsers")
    public String showAddUserForm(Model model, Authentication authentication) {
        List<User> users = getUsersWithoutInternalAPIUsers();
        Map<String, String> roleDetails = Role.getAllRoleDetails();

        model.addAttribute("users", users);
        model.addAttribute("currentUsername", authentication.getName());
        model.addAttribute("roleDetails", roleDetails);
        return "addUsers";
    }

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @GetMapping("/account")
    public String account(HttpServletRequest request, Model model, Authentication authentication) {
        if (!isAuthenticated(authentication)) {
            return "redirect:/";
        }

        UserDetails userDetails = (UserDetails) authentication.getPrincipal();
        String username = userDetails.getUsername();
        Optional<User> user = userRepository.findByUsername(username);

        if (!user.isPresent()) {
            return "redirect:/error";
        }

        String settingsJson = convertSettingsToJson(user.get());

        model.addAttribute("username", username);
        model.addAttribute("role", user.get().getRolesAsString());
        model.addAttribute("settings", settingsJson);
        model.addAttribute("changeCredsFlag", user.get().isFirstLogin());
        model.addAttribute("currentPage", "account");

        return "account";
    }

    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @GetMapping("/change-creds")
    public String changeCredentials(
            HttpServletRequest request, Model model, Authentication authentication) {
        if (!isAuthenticated(authentication)) {
            return "redirect:/";
        }

        UserDetails userDetails = (UserDetails) authentication.getPrincipal();
        String username = userDetails.getUsername();

        model.addAttribute("username", username);
        return "change-creds";
    }

    private boolean isAuthenticated(Authentication authentication) {
        return authentication != null && authentication.isAuthenticated();
    }

    private void addLoginAttributes(HttpServletRequest request, Model model) {
        if (request.getParameter("error") != null) {
            model.addAttribute("error", request.getParameter("error"));
        }
        if (request.getParameter("logout") != null) {
            model.addAttribute("logoutMessage", "You have been logged out.");
        }
        model.addAttribute("currentPage", "login");
    }

    private List<User> getUsersWithoutInternalAPIUsers() {
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
                        break;
                    }
                }
            }
        }
        return allUsers;
    }

    private String convertSettingsToJson(User user) {
        ObjectMapper objectMapper = new ObjectMapper();
        try {
            return objectMapper.writeValueAsString(user.getSettings());
        } catch (JsonProcessingException e) {
            e.printStackTrace();
            return "redirect:/error";
        }
    }
}
