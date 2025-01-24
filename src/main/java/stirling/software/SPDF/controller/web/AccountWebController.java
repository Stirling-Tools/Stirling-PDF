package stirling.software.SPDF.controller.web;

import static stirling.software.SPDF.utils.validation.Validator.validateProvider;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

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
import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.config.security.saml2.CustomSaml2AuthenticatedPrincipal;
import stirling.software.SPDF.config.security.session.SessionPersistentRegistry;
import stirling.software.SPDF.model.*;
import stirling.software.SPDF.model.ApplicationProperties.Security;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2.Client;
import stirling.software.SPDF.model.ApplicationProperties.Security.SAML2;
import stirling.software.SPDF.model.provider.GitHubProvider;
import stirling.software.SPDF.model.provider.GoogleProvider;
import stirling.software.SPDF.model.provider.KeycloakProvider;
import stirling.software.SPDF.repository.UserRepository;

@Controller
@Slf4j
@Tag(name = "Account Security", description = "Account Security APIs")
public class AccountWebController {

    public static final String OAUTH_2_AUTHORIZATION = "/oauth2/authorization/";

    private final ApplicationProperties applicationProperties;
    private final SessionPersistentRegistry sessionPersistentRegistry;
    // Assuming you have a repository for user operations
    private final UserRepository userRepository;

    public AccountWebController(
            ApplicationProperties applicationProperties,
            SessionPersistentRegistry sessionPersistentRegistry,
            UserRepository userRepository) {
        this.applicationProperties = applicationProperties;
        this.sessionPersistentRegistry = sessionPersistentRegistry;
        this.userRepository = userRepository;
    }

    @GetMapping("/login")
    public String login(HttpServletRequest request, Model model, Authentication authentication) {
        // If the user is already authenticated, redirect them to the home page.
        if (authentication != null && authentication.isAuthenticated()) {
            return "redirect:/";
        }

        Map<String, String> providerList = new HashMap<>();
        Security securityProps = applicationProperties.getSecurity();
        OAUTH2 oauth = securityProps.getOauth2();

        if (oauth != null) {
            if (oauth.getEnabled()) {
                if (oauth.isSettingsValid()) {
                    String firstChar = String.valueOf(oauth.getProvider().charAt(0));
                    String clientName =
                            oauth.getProvider().replaceFirst(firstChar, firstChar.toUpperCase());
                    providerList.put(OAUTH_2_AUTHORIZATION + "oidc", clientName);
                }

                Client client = oauth.getClient();

                if (client != null) {
                    GoogleProvider google = client.getGoogle();

                    if (validateProvider(google)) {
                        providerList.put(
                                OAUTH_2_AUTHORIZATION + google.getName(), google.getClientName());
                    }

                    GitHubProvider github = client.getGithub();

                    if (validateProvider(github)) {
                        providerList.put(
                                OAUTH_2_AUTHORIZATION + github.getName(), github.getClientName());
                    }

                    KeycloakProvider keycloak = client.getKeycloak();

                    if (validateProvider(keycloak)) {
                        providerList.put(
                                OAUTH_2_AUTHORIZATION + keycloak.getName(),
                                keycloak.getClientName());
                    }
                }
            }
        }

        SAML2 saml2 = securityProps.getSaml2();

        if (securityProps.isSaml2Active()
                && applicationProperties.getSystem().getEnableAlphaFunctionality()) {
            providerList.put("/saml2/authenticate/" + saml2.getRegistrationId(), "SAML 2");
        }

        // Remove any null keys/values from the providerList
        providerList
                .entrySet()
                .removeIf(entry -> entry.getKey() == null || entry.getValue() == null);
        model.addAttribute("providerList", providerList);
        model.addAttribute("loginMethod", securityProps.getLoginMethod());

        boolean altLogin = !providerList.isEmpty() ? securityProps.isAltLogin() : false;

        model.addAttribute("altLogin", altLogin);
        model.addAttribute("currentPage", "login");
        String error = request.getParameter("error");

        if (error != null) {
            switch (error) {
                case "badCredentials" -> error = "login.invalid";
                case "locked" -> error = "login.locked";
                case "oauth2AuthenticationError" -> error = "userAlreadyExistsOAuthMessage";
            }

            model.addAttribute("error", error);
        }
        String errorOAuth = request.getParameter("errorOAuth");
        if (errorOAuth != null) {
            switch (errorOAuth) {
                case "oAuth2AutoCreateDisabled" -> errorOAuth = "login.oAuth2AutoCreateDisabled";
                case "invalidUsername" -> errorOAuth = "login.invalid";
                case "userAlreadyExistsWeb" -> errorOAuth = "userAlreadyExistsWebMessage";
                case "oAuth2AuthenticationErrorWeb" -> errorOAuth = "login.oauth2InvalidUserType";
                case "invalid_token_response" -> errorOAuth = "login.oauth2InvalidTokenResponse";
                case "authorization_request_not_found" ->
                        errorOAuth = "login.oauth2RequestNotFound";
                case "access_denied" -> errorOAuth = "login.oauth2AccessDenied";
                case "invalid_user_info_response" ->
                        errorOAuth = "login.oauth2InvalidUserInfoResponse";
                case "invalid_request" -> errorOAuth = "login.oauth2invalidRequest";
                case "invalid_id_token" -> errorOAuth = "login.oauth2InvalidIdToken";
                case "oAuth2AdminBlockedUser" -> errorOAuth = "login.oAuth2AdminBlockedUser";
                case "userIsDisabled" -> errorOAuth = "login.userIsDisabled";
                case "invalid_destination" -> errorOAuth = "login.invalid_destination";
                case "relying_party_registration_not_found" ->
                        errorOAuth = "login.relyingPartyRegistrationNotFound";
                // Valid InResponseTo was not available from the validation context, unable to
                // evaluate
                case "invalid_in_response_to" -> errorOAuth = "login.invalid_in_response_to";
                case "not_authentication_provider_found" ->
                        errorOAuth = "login.not_authentication_provider_found";
            }

            model.addAttribute("errorOAuth", errorOAuth);
        }

        if (request.getParameter("messageType") != null) {
            model.addAttribute("messageType", "changedCredsMessage");
        }

        if (request.getParameter("logout") != null) {
            model.addAttribute("logoutMessage", "You have been logged out.");
        }

        return "login";
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @GetMapping("/addUsers")
    public String showAddUserForm(
            HttpServletRequest request, Model model, Authentication authentication) {
        List<User> allUsers = userRepository.findAll();
        Iterator<User> iterator = allUsers.iterator();
        Map<String, String> roleDetails = Role.getAllRoleDetails();
        // Map to store session information and user activity status
        Map<String, Boolean> userSessions = new HashMap<>();
        Map<String, Date> userLastRequest = new HashMap<>();
        int activeUsers = 0;
        int disabledUsers = 0;
        while (iterator.hasNext()) {
            User user = iterator.next();
            if (user != null) {
                for (Authority authority : user.getAuthorities()) {
                    if (authority.getAuthority().equals(Role.INTERNAL_API_USER.getRoleId())) {
                        iterator.remove();
                        roleDetails.remove(Role.INTERNAL_API_USER.getRoleId());
                        // Break out of the inner loop once the user is removed
                        break;
                    }
                }
                // Determine the user's session status and last request time
                int maxInactiveInterval = sessionPersistentRegistry.getMaxInactiveInterval();
                boolean hasActiveSession = false;
                Date lastRequest = null;
                Optional<SessionEntity> latestSession =
                        sessionPersistentRegistry.findLatestSession(user.getUsername());
                if (latestSession.isPresent()) {
                    SessionEntity sessionEntity = latestSession.get();
                    Date lastAccessedTime = sessionEntity.getLastRequest();
                    Instant now = Instant.now();
                    // Calculate session expiration and update session status accordingly
                    Instant expirationTime =
                            lastAccessedTime
                                    .toInstant()
                                    .plus(maxInactiveInterval, ChronoUnit.SECONDS);
                    if (now.isAfter(expirationTime)) {
                        sessionPersistentRegistry.expireSession(sessionEntity.getSessionId());
                        hasActiveSession = false;
                    } else {
                        hasActiveSession = !sessionEntity.isExpired();
                    }
                    lastRequest = sessionEntity.getLastRequest();
                } else {
                    hasActiveSession = false;
                    // No session, set default last request time
                    lastRequest = new Date(0);
                }
                userSessions.put(user.getUsername(), hasActiveSession);
                userLastRequest.put(user.getUsername(), lastRequest);
                if (hasActiveSession) {
                    activeUsers++;
                }
                if (!user.isEnabled()) {
                    disabledUsers++;
                }
            }
        }
        // Sort users by active status and last request date
        List<User> sortedUsers =
                allUsers.stream()
                        .sorted(
                                (u1, u2) -> {
                                    boolean u1Active = userSessions.get(u1.getUsername());
                                    boolean u2Active = userSessions.get(u2.getUsername());
                                    if (u1Active && !u2Active) {
                                        return -1;
                                    } else if (!u1Active && u2Active) {
                                        return 1;
                                    } else {
                                        Date u1LastRequest =
                                                userLastRequest.getOrDefault(
                                                        u1.getUsername(), new Date(0));
                                        Date u2LastRequest =
                                                userLastRequest.getOrDefault(
                                                        u2.getUsername(), new Date(0));
                                        return u2LastRequest.compareTo(u1LastRequest);
                                    }
                                })
                        .collect(Collectors.toList());
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
                case "invalidPassword":
                    addMessage = "invalidPasswordMessage";
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
                case "disabledCurrentUser":
                    changeMessage = "disabledCurrentUserMessage";
                    break;
                default:
                    changeMessage = messageType;
                    break;
            }
            model.addAttribute("changeMessage", changeMessage);
        }
        model.addAttribute("users", sortedUsers);
        model.addAttribute("currentUsername", authentication.getName());
        model.addAttribute("roleDetails", roleDetails);
        model.addAttribute("userSessions", userSessions);
        model.addAttribute("userLastRequest", userLastRequest);
        model.addAttribute("totalUsers", allUsers.size());
        model.addAttribute("activeUsers", activeUsers);
        model.addAttribute("disabledUsers", disabledUsers);
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
            if (principal instanceof UserDetails userDetails) {
                // Retrieve username and other attributes
                username = userDetails.getUsername();
                // Add oAuth2 Login attributes to the model
                model.addAttribute("oAuth2Login", false);
            }
            if (principal instanceof OAuth2User userDetails) {
                // Retrieve username and other attributes
                username = userDetails.getName();
                // Add oAuth2 Login attributes to the model
                model.addAttribute("oAuth2Login", true);
            }
            if (principal instanceof CustomSaml2AuthenticatedPrincipal userDetails) {
                // Retrieve username and other attributes
                username = userDetails.getName();
                // Add oAuth2 Login attributes to the model
                model.addAttribute("oAuth2Login", true);
            }
            if (username != null) {
                // Fetch user details from the database, assuming findByUsername method exists
                Optional<User> user = userRepository.findByUsernameIgnoreCaseWithSettings(username);

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
                    log.error("exception", e);
                    return "redirect:/error";
                }

                String messageType = request.getParameter("messageType");
                if (messageType != null) {
                    switch (messageType) {
                        case "notAuthenticated" -> messageType = "notAuthenticatedMessage";
                        case "userNotFound" -> messageType = "userNotFoundMessage";
                        case "incorrectPassword" -> messageType = "incorrectPasswordMessage";
                        case "usernameExists" -> messageType = "usernameExistsMessage";
                        case "invalidUsername" -> messageType = "invalidUsernameMessage";
                    }
                }
                // Add attributes to the model
                model.addAttribute("username", username);
                model.addAttribute("messageType", messageType);
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
                        userRepository
                                .findByUsernameIgnoreCase( // Assuming findByUsername method exists
                                        username);
                if (!user.isPresent()) {
                    // Handle error appropriately
                    // Example redirection in case of error
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
