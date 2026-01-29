package stirling.software.proprietary.security.service;

import static stirling.software.proprietary.security.service.MfaService.MFA_ENABLED_KEY;
import static stirling.software.proprietary.security.service.MfaService.MFA_LAST_USED_STEP_KEY;
import static stirling.software.proprietary.security.service.MfaService.MFA_REQUIRED_KEY;
import static stirling.software.proprietary.security.service.MfaService.MFA_SECRET_KEY;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.AuthorityRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;

@Service
@Slf4j
@RequiredArgsConstructor
public class UserService implements UserServiceInterface {

    private final UserRepository userRepository;
    private final TeamRepository teamRepository;
    private final AuthorityRepository authorityRepository;

    private final PasswordEncoder passwordEncoder;

    private final MessageSource messageSource;

    private final SessionPersistentRegistry sessionRegistry;

    private final DatabaseServiceInterface databaseService;

    private final ApplicationProperties.Security.OAUTH2 oAuth2;

    public void processSSOPostLogin(
            String username,
            String ssoProviderId,
            String ssoProvider,
            boolean autoCreateUser,
            AuthenticationType type)
            throws IllegalArgumentException, SQLException, UnsupportedProviderException {
        if (!isUsernameValid(username)) {
            return;
        }

        // Find user by SSO provider ID first
        Optional<User> existingUser;
        if (ssoProviderId != null && ssoProvider != null) {
            existingUser =
                    userRepository.findBySsoProviderAndSsoProviderId(ssoProvider, ssoProviderId);

            if (existingUser.isPresent()) {
                log.debug("User found by SSO provider ID: {}", ssoProviderId);
                return;
            }
        }

        existingUser = findByUsernameIgnoreCase(username);
        if (existingUser.isPresent()) {
            User user = existingUser.get();

            // Migrate existing user to use provider ID if not already set
            if (user.getSsoProviderId() == null && ssoProviderId != null && ssoProvider != null) {
                log.info("Migrating user {} to use SSO provider ID: {}", username, ssoProviderId);
                user.setSsoProviderId(ssoProviderId);
                user.setSsoProvider(ssoProvider);
                userRepository.save(user);
                databaseService.exportDatabase();
            }
            return;
        }

        if (autoCreateUser) {
            SaveUserRequest.Builder builder =
                    SaveUserRequest.builder()
                            .username(username)
                            .ssoProviderId(ssoProviderId)
                            .ssoProvider(ssoProvider)
                            .authenticationType(type);
            saveUserCore(builder.build());
        }
    }

    public Authentication getAuthentication(String apiKey) {
        Optional<User> user = getUserByApiKey(apiKey);
        if (user.isEmpty()) {
            throw new UsernameNotFoundException("API key is not valid");
        }
        // Convert the user into an Authentication object
        return new UsernamePasswordAuthenticationToken( // principal (typically the user)
                user, // credentials (we don't expose the password or API key here)
                null, // user's authorities (roles/permissions)
                getAuthorities(user.get()));
    }

    private Collection<? extends GrantedAuthority> getAuthorities(User user) {
        return user.getAuthorities();
    }

    private String generateApiKey() {
        String apiKey;
        do {
            apiKey = UUID.randomUUID().toString();
        } while ( // Ensure uniqueness
        userRepository.findByApiKey(apiKey).isPresent());
        return apiKey;
    }

    public User addApiKeyToUser(String username) {
        Optional<User> userOpt = findByUsernameIgnoreCase(username);
        User user = saveUser(userOpt, generateApiKey());
        try {
            databaseService.exportDatabase();
        } catch (SQLException | UnsupportedProviderException e) {
            log.error("Error exporting database after adding API key to user", e);
        }
        return user;
    }

    private User saveUser(Optional<User> user, String apiKey) {
        if (user.isPresent()) {
            user.get().setApiKey(apiKey);
            return userRepository.save(user.get());
        }
        throw new UsernameNotFoundException("User not found");
    }

    public User refreshApiKeyForUser(String username) {
        // reuse the add API key method for refreshing
        return addApiKeyToUser(username);
    }

    @Override
    public String getApiKeyForUser(String username) {
        User user =
                findByUsernameIgnoreCase(username)
                        .orElseThrow(() -> new UsernameNotFoundException("User not found"));
        if (user.getApiKey() == null || user.getApiKey().length() == 0) {
            user = addApiKeyToUser(username);
        }
        return user.getApiKey();
    }

    public boolean isValidApiKey(String apiKey) {
        return userRepository.findByApiKey(apiKey).isPresent();
    }

    public Optional<User> getUserByApiKey(String apiKey) {
        return userRepository.findByApiKey(apiKey);
    }

    public Optional<User> loadUserByApiKey(String apiKey) {
        Optional<User> user = userRepository.findByApiKey(apiKey);
        if (user.isPresent()) {
            return user;
        }
        // or throw an exception
        return null;
    }

    public boolean validateApiKeyForUser(String username, String apiKey) {
        Optional<User> userOpt = findByUsernameIgnoreCase(username);
        return userOpt.isPresent() && apiKey.equals(userOpt.get().getApiKey());
    }

    public void deleteUser(String username) {
        Optional<User> userOpt = findByUsernameIgnoreCase(username);
        if (userOpt.isPresent()) {
            for (Authority authority : userOpt.get().getAuthorities()) {
                if (authority.getAuthority().equals(Role.INTERNAL_API_USER.getRoleId())) {
                    return;
                }
            }
            userRepository.delete(userOpt.get());
        }
        invalidateUserSessions(username);
    }

    public boolean usernameExists(String username) {
        return findByUsername(username).isPresent();
    }

    public boolean usernameExistsIgnoreCase(String username) {
        return findByUsernameIgnoreCase(username).isPresent();
    }

    public boolean hasUsers() {
        long userCount = userRepository.count();
        if (findByUsernameIgnoreCase(Role.INTERNAL_API_USER.getRoleId()).isPresent()) {
            userCount -= 1;
        }
        return userCount > 0;
    }

    public void updateUserSettings(String username, Map<String, String> updates)
            throws SQLException, UnsupportedProviderException {
        Optional<User> userOpt = findByUsernameIgnoreCaseWithSettings(username);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            Map<String, String> settingsMap = user.getSettings();
            if (settingsMap == null) {
                settingsMap = new HashMap<>();
            }
            settingsMap.clear();
            settingsMap.putAll(updates);
            user.setSettings(settingsMap);
            userRepository.save(user);
            databaseService.exportDatabase();
        }
    }

    public Optional<User> findByUsername(String username) {
        return userRepository.findByUsername(username);
    }

    public Optional<User> findByUsernameIgnoreCase(String username) {
        return userRepository.findByUsernameIgnoreCase(username);
    }

    public Optional<User> findByUsernameIgnoreCaseWithSettings(String username) {
        return userRepository.findByUsernameIgnoreCaseWithSettings(username);
    }

    public Authority findRole(User user) {
        return authorityRepository.findByUserId(user.getId());
    }

    public void changeUsername(User user, String newUsername)
            throws IllegalArgumentException, SQLException, UnsupportedProviderException {
        if (!isUsernameValid(newUsername)) {
            throw new IllegalArgumentException(getInvalidUsernameMessage());
        }
        user.setUsername(newUsername);
        userRepository.save(user);
        databaseService.exportDatabase();
    }

    public void changePassword(User user, String newPassword)
            throws SQLException, UnsupportedProviderException {
        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        databaseService.exportDatabase();
    }

    public void changeFirstUse(User user, boolean firstUse)
            throws SQLException, UnsupportedProviderException {
        user.setFirstLogin(firstUse);
        userRepository.save(user);
        databaseService.exportDatabase();
    }

    public void changeRole(User user, String newRole)
            throws SQLException, UnsupportedProviderException {
        Authority userAuthority = this.findRole(user);
        userAuthority.setAuthority(newRole);
        authorityRepository.save(userAuthority);
        databaseService.exportDatabase();
    }

    public void changeUserEnabled(User user, Boolean enbeled)
            throws SQLException, UnsupportedProviderException {
        user.setEnabled(enbeled);
        userRepository.save(user);
        databaseService.exportDatabase();
    }

    public void changeUserTeam(User user, Team team)
            throws SQLException, UnsupportedProviderException {
        if (team == null) {
            team = getDefaultTeam();
        }
        user.setTeam(team);
        userRepository.save(user);
        databaseService.exportDatabase();
    }

    public boolean isPasswordCorrect(User user, String currentPassword) {
        return passwordEncoder.matches(currentPassword, user.getPassword());
    }

    /**
     * Resolves a team based on the provided information, with consistent error handling.
     *
     * @param teamId The ID of the team to find, may be null
     * @param defaultTeamSupplier A supplier that provides a default team when teamId is null
     * @return The resolved Team object
     * @throws IllegalArgumentException If the teamId is invalid
     */
    private Team resolveTeam(Long teamId, Supplier<Team> defaultTeamSupplier) {
        if (teamId == null) {
            return defaultTeamSupplier.get();
        }

        return teamRepository
                .findById(teamId)
                .orElseThrow(() -> new IllegalArgumentException("Invalid team ID: " + teamId));
    }

    /**
     * Gets the default team, creating it if it doesn't exist.
     *
     * @return The default team
     */
    private Team getDefaultTeam() {
        return teamRepository
                .findByName("Default")
                .orElseGet(
                        () -> {
                            Team team = new Team();
                            team.setName("Default");
                            return teamRepository.save(team);
                        });
    }

    /**
     * Core method to save a user based on the provided SaveUserRequest.
     *
     * @param request The SaveUserRequest containing user details
     * @return The saved User object
     * @throws IllegalArgumentException If the username is invalid
     * @throws SQLException If a database error occurs
     * @throws UnsupportedProviderException If an unsupported provider is specified
     */
    public User saveUserCore(SaveUserRequest request)
            throws IllegalArgumentException, SQLException, UnsupportedProviderException {

        if (!isUsernameValid(request.getUsername())) {
            throw new IllegalArgumentException(getInvalidUsernameMessage());
        }

        User user = new User();
        user.setUsername(request.getUsername());

        // Set password if provided
        if (request.getPassword() != null && !request.getPassword().isEmpty()) {
            user.setPassword(passwordEncoder.encode(request.getPassword()));
        }

        // Set SSO provider details if provided
        if (request.getSsoProviderId() != null && request.getSsoProvider() != null) {
            user.setSsoProviderId(request.getSsoProviderId());
            user.setSsoProvider(request.getSsoProvider());
        }

        // Set authentication type
        user.setAuthenticationType(request.getAuthenticationType());

        // Set enabled status
        user.setEnabled(request.isEnabled());

        // Set first login flag
        user.setFirstLogin(request.isFirstLogin());

        // Set MFA requirement
        Map<String, String> settings = user.getSettings();
        settings.put(MFA_REQUIRED_KEY, String.valueOf(request.isRequireMfa()));
        settings.put(MFA_ENABLED_KEY, String.valueOf(request.isMfaEnabled()));
        if (request.getMfaSecret() != null && !request.getMfaSecret().isEmpty()) {
            settings.put(MFA_SECRET_KEY, request.getMfaSecret());
        } else {
            settings.remove(MFA_SECRET_KEY);
        }
        if (request.getMfaLastUsedStep() != null) {
            settings.put(MFA_LAST_USED_STEP_KEY, String.valueOf(request.getMfaLastUsedStep()));
        } else {
            settings.remove(MFA_LAST_USED_STEP_KEY);
        }
        log.info(
                "MFA required set to true for user {} {}",
                request.getUsername(),
                user.getSettings().toString());

        // Set role (authority)
        user.addAuthority(new Authority(request.getRole(), user));

        // Resolve and set team
        if (request.getTeam() != null) {
            user.setTeam(request.getTeam());
        } else {
            user.setTeam(resolveTeam(request.getTeamId(), this::getDefaultTeam));
        }

        // Save user
        userRepository.save(user);

        // Export database
        databaseService.exportDatabase();

        return user;
    }

    public boolean isUsernameValid(String username) {
        // Checks whether the simple username is formatted correctly
        // Regular expression for user name: Min. 3 characters, max. 50 characters
        boolean isValidSimpleUsername =
                RegexPatternUtils.getInstance()
                        .getUsernameValidationPattern()
                        .matcher(username)
                        .matches();

        // Checks whether the email address is formatted correctly
        // Regular expression for email addresses: Max. 320 characters, with RFC-like validation
        boolean isValidEmail =
                RegexPatternUtils.getInstance()
                        .getEmailValidationPattern()
                        .matcher(username)
                        .matches();

        List<String> notAllowedUserList = new ArrayList<>();
        notAllowedUserList.add("ALL_USERS".toLowerCase(Locale.ROOT));
        notAllowedUserList.add("anonymoususer");
        String normalizedUsername = username.toLowerCase(Locale.ROOT);
        boolean notAllowedUser = notAllowedUserList.contains(normalizedUsername);
        return (isValidSimpleUsername || isValidEmail) && !notAllowedUser;
    }

    private String getInvalidUsernameMessage() {
        return messageSource.getMessage(
                "invalidUsernameMessage", null, LocaleContextHolder.getLocale());
    }

    public boolean hasPassword(String username) {
        Optional<User> user = findByUsernameIgnoreCase(username);
        return user.isPresent() && user.get().hasPassword();
    }

    public boolean isSsoAuthenticationTypeByUsername(String username) {
        Optional<User> user = findByUsernameIgnoreCase(username);
        if (user.isEmpty()) {
            return false;
        }

        String authType = user.get().getAuthenticationType();
        if (authType == null) {
            return false;
        }

        try {
            AuthenticationType authenticationType =
                    AuthenticationType.valueOf(authType.toUpperCase(Locale.ROOT));
            if (authenticationType == AuthenticationType.OAUTH2
                    || authenticationType == AuthenticationType.SAML2) {
                return true;
            }
        } catch (IllegalArgumentException ignored) {
            // Fall through to legacy string comparison below
        }

        // Backward compatibility for legacy "SSO" value without relying on the deprecated enum
        return "SSO".equalsIgnoreCase(authType);
    }

    public boolean isAuthenticationTypeByUsername(
            String username, AuthenticationType authenticationType) {
        Optional<User> user = findByUsernameIgnoreCase(username);
        return user.isPresent()
                && authenticationType.name().equalsIgnoreCase(user.get().getAuthenticationType());
    }

    public boolean isUserDisabled(String username) {
        Optional<User> userOpt = findByUsernameIgnoreCase(username);
        return userOpt.map(user -> !user.isEnabled()).orElse(false);
    }

    public void invalidateUserSessions(String username) {
        String usernameP = "";

        for (Object principal : sessionRegistry.getAllPrincipals()) {
            for (SessionInformation sessionsInformation :
                    sessionRegistry.getAllSessions(principal, false)) {
                if (principal instanceof UserDetails detailsUser) {
                    usernameP = detailsUser.getUsername();
                } else if (principal instanceof OAuth2User oAuth2User) {
                    usernameP = oAuth2User.getName();
                } else if (principal instanceof CustomSaml2AuthenticatedPrincipal saml2User) {
                    usernameP = saml2User.name();
                } else if (principal instanceof String stringUser) {
                    usernameP = stringUser;
                }
                if (usernameP.equalsIgnoreCase(username)) {
                    sessionRegistry.expireSession(sessionsInformation.getSessionId());
                }
            }
        }
    }

    @Override
    public String getCurrentUsername() {
        Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();

        if (principal instanceof UserDetails detailsUser) {
            return detailsUser.getUsername();
        } else if (principal instanceof User domainUser) {
            return domainUser.getUsername();
        } else if (principal instanceof OAuth2User oAuth2User) {
            return oAuth2User.getAttribute(oAuth2.getUseAsUsername());
        } else if (principal instanceof CustomSaml2AuthenticatedPrincipal saml2User) {
            return saml2User.name();
        } else if (principal instanceof String stringUser) {
            return stringUser;
        }
        return null;
    }

    @Override
    public boolean isCurrentUserAdmin() {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication != null
                    && authentication.isAuthenticated()
                    && !"anonymousUser".equals(authentication.getPrincipal())) {
                return authentication.getAuthorities().stream()
                        .anyMatch(auth -> Role.ADMIN.getRoleId().equals(auth.getAuthority()));
            }
        } catch (Exception e) {
            log.debug("Error checking admin status", e);
        }
        return false;
    }

    @Override
    public boolean isCurrentUserFirstLogin() {
        try {
            String username = getCurrentUsername();
            if (username != null) {
                Optional<User> userOpt = findByUsernameIgnoreCase(username);
                if (userOpt.isPresent()) {
                    return !userOpt.get().hasCompletedInitialSetup();
                }
            }
        } catch (Exception e) {
            log.debug("Error checking first login status", e);
        }
        return false;
    }

    @Transactional
    public void syncCustomApiUser(String customApiKey) {
        if (customApiKey == null || customApiKey.trim().isBlank()) {
            return;
        }

        String username = "CUSTOM_API_USER";
        Optional<User> existingUser = findByUsernameIgnoreCase(username);

        existingUser.ifPresentOrElse(
                user -> {
                    // Update API key if it has changed
                    User updatedUser = existingUser.get();

                    if (!customApiKey.equals(updatedUser.getApiKey())) {
                        updatedUser.setApiKey(customApiKey);
                        userRepository.save(updatedUser);
                    }
                },
                () -> {
                    // Create new user with API role
                    User user = new User();
                    user.setUsername(username);
                    user.setPassword(UUID.randomUUID().toString());
                    user.setEnabled(true);
                    user.setFirstLogin(false);
                    user.setAuthenticationType(AuthenticationType.WEB);
                    user.setApiKey(customApiKey);
                    user.addAuthority(new Authority(Role.INTERNAL_API_USER.getRoleId(), user));
                    userRepository.save(user);
                });

        try {
            databaseService.exportDatabase();
        } catch (SQLException | UnsupportedProviderException e) {
            log.error("Error exporting database after synchronising custom API user", e);
        }
    }

    @Override
    public long getTotalUsersCount() {
        // Count all users in the database
        long userCount = userRepository.count();
        // Exclude the internal API user from the count
        if (findByUsernameIgnoreCase(Role.INTERNAL_API_USER.getRoleId()).isPresent()) {
            userCount -= 1;
        }
        return userCount;
    }

    public List<User> getUsersWithoutTeam() {
        return userRepository.findAllWithoutTeam();
    }

    public void saveAll(List<User> users) {
        userRepository.saveAll(users);
    }

    /**
     * Counts the number of OAuth/SAML users. Includes users with sso_provider set OR
     * authenticationType is sso/oauth2/saml2 (catches V1 users who never signed in).
     *
     * @return Count of OAuth users
     */
    public long countOAuthUsers() {
        return userRepository.countSsoUsers();
    }

    /**
     * Counts the number of OAuth users who are grandfathered.
     *
     * @return Count of grandfathered OAuth users
     */
    public long countGrandfatheredOAuthUsers() {
        return userRepository.countByOauthGrandfatheredTrue();
    }

    /**
     * Grandfathers all existing OAuth/SAML users. This marks all users with an SSO provider as
     * grandfathered, allowing them to keep OAuth access even without a paid license.
     *
     * @return Number of users updated
     */
    @Transactional
    public int grandfatherAllOAuthUsers() {
        List<User> ssoUsers = userRepository.findAllSsoUsers();
        int updated = 0;

        for (User user : ssoUsers) {
            if (!user.isOauthGrandfathered()) {
                user.setOauthGrandfathered(true);
                updated++;
            }
        }

        if (updated > 0) {
            userRepository.saveAll(ssoUsers);
        }

        return updated;
    }

    /**
     * Grandfathers SSO users who have never created a session (invited/pending accounts). These
     * users would otherwise be blocked when SSO requires a paid license despite existing before the
     * policy change.
     *
     * @return Number of pending users updated
     */
    @Transactional
    public int grandfatherPendingSsoUsersWithoutSession() {
        List<User> pendingUsers = userRepository.findPendingSsoUsersWithoutSession();
        int updated = 0;

        for (User user : pendingUsers) {
            if (!user.isOauthGrandfathered()) {
                user.setOauthGrandfathered(true);
                updated++;
            }
        }

        if (updated > 0) {
            userRepository.saveAll(pendingUsers);
        }

        return updated;
    }
}
