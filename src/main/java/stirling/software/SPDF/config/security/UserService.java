package stirling.software.SPDF.config.security;

import java.io.IOException;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import stirling.software.SPDF.config.DatabaseBackupInterface;
import stirling.software.SPDF.controller.api.pipeline.UserServiceInterface;
import stirling.software.SPDF.model.AuthenticationType;
import stirling.software.SPDF.model.Authority;
import stirling.software.SPDF.model.Role;
import stirling.software.SPDF.model.User;
import stirling.software.SPDF.repository.AuthorityRepository;
import stirling.software.SPDF.repository.UserRepository;

@Service
public class UserService implements UserServiceInterface {

    @Autowired private UserRepository userRepository;

    @Autowired private AuthorityRepository authorityRepository;

    @Autowired private PasswordEncoder passwordEncoder;

    @Autowired private MessageSource messageSource;

    @Autowired DatabaseBackupInterface databaseBackupHelper;

    // Handle OAUTH2 login and user auto creation.
    public boolean processOAuth2PostLogin(String username, boolean autoCreateUser)
            throws IllegalArgumentException, IOException {
        if (!isUsernameValid(username)) {
            return false;
        }
        Optional<User> existingUser = userRepository.findByUsernameIgnoreCase(username);
        if (existingUser.isPresent()) {
            return true;
        }
        if (autoCreateUser) {
            saveUser(username, AuthenticationType.OAUTH2);
            return true;
        }
        return false;
    }

    public Authentication getAuthentication(String apiKey) {
        User user = getUserByApiKey(apiKey);
        if (user == null) {
            throw new UsernameNotFoundException("API key is not valid");
        }

        // Convert the user into an Authentication object
        return new UsernamePasswordAuthenticationToken(
                user, // principal (typically the user)
                null, // credentials (we don't expose the password or API key here)
                getAuthorities(user) // user's authorities (roles/permissions)
                );
    }

    private Collection<? extends GrantedAuthority> getAuthorities(User user) {
        // Convert each Authority object into a SimpleGrantedAuthority object.
        return user.getAuthorities().stream()
                .map((Authority authority) -> new SimpleGrantedAuthority(authority.getAuthority()))
                .collect(Collectors.toList());
    }

    private String generateApiKey() {
        String apiKey;
        do {
            apiKey = UUID.randomUUID().toString();
        } while (userRepository.findByApiKey(apiKey) != null); // Ensure uniqueness
        return apiKey;
    }

    public User addApiKeyToUser(String username) {
        User user =
                userRepository
                        .findByUsernameIgnoreCase(username)
                        .orElseThrow(() -> new UsernameNotFoundException("User not found"));

        user.setApiKey(generateApiKey());
        return userRepository.save(user);
    }

    public User refreshApiKeyForUser(String username) {
        return addApiKeyToUser(username); // reuse the add API key method for refreshing
    }

    public String getApiKeyForUser(String username) {
        User user =
                userRepository
                        .findByUsernameIgnoreCase(username)
                        .orElseThrow(() -> new UsernameNotFoundException("User not found"));
        return user.getApiKey();
    }

    public boolean isValidApiKey(String apiKey) {
        return userRepository.findByApiKey(apiKey) != null;
    }

    public User getUserByApiKey(String apiKey) {
        return userRepository.findByApiKey(apiKey);
    }

    public UserDetails loadUserByApiKey(String apiKey) {
        User user = userRepository.findByApiKey(apiKey);
        if (user != null) {
            // Convert your User entity to a UserDetails object with authorities
            return new org.springframework.security.core.userdetails.User(
                    user.getUsername(),
                    user.getPassword(), // you might not need this for API key auth
                    getAuthorities(user));
        }
        return null; // or throw an exception
    }

    public boolean validateApiKeyForUser(String username, String apiKey) {
        Optional<User> userOpt = userRepository.findByUsernameIgnoreCase(username);
        return userOpt.isPresent() && apiKey.equals(userOpt.get().getApiKey());
    }

    public void saveUser(String username, AuthenticationType authenticationType)
            throws IllegalArgumentException, IOException {
        if (!isUsernameValid(username)) {
            throw new IllegalArgumentException(getInvalidUsernameMessage());
        }
        User user = new User();
        user.setUsername(username);
        user.setEnabled(true);
        user.setFirstLogin(false);
        user.addAuthority(new Authority(Role.USER.getRoleId(), user));
        user.setAuthenticationType(authenticationType);
        userRepository.save(user);
        databaseBackupHelper.exportDatabase();
    }

    public void saveUser(String username, String password)
            throws IllegalArgumentException, IOException {
        if (!isUsernameValid(username)) {
            throw new IllegalArgumentException(getInvalidUsernameMessage());
        }
        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(password));
        user.setEnabled(true);
        user.setAuthenticationType(AuthenticationType.WEB);
        userRepository.save(user);
        databaseBackupHelper.exportDatabase();
    }

    public void saveUser(String username, String password, String role, boolean firstLogin)
            throws IllegalArgumentException, IOException {
        if (!isUsernameValid(username)) {
            throw new IllegalArgumentException(getInvalidUsernameMessage());
        }
        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(password));
        user.addAuthority(new Authority(role, user));
        user.setEnabled(true);
        user.setAuthenticationType(AuthenticationType.WEB);
        user.setFirstLogin(firstLogin);
        userRepository.save(user);
        databaseBackupHelper.exportDatabase();
    }

    public void saveUser(String username, String password, String role)
            throws IllegalArgumentException, IOException {
        saveUser(username, password, role, false);
    }

    public void deleteUser(String username) {
        Optional<User> userOpt = userRepository.findByUsernameIgnoreCase(username);
        if (userOpt.isPresent()) {
            for (Authority authority : userOpt.get().getAuthorities()) {
                if (authority.getAuthority().equals(Role.INTERNAL_API_USER.getRoleId())) {
                    return;
                }
            }
            userRepository.delete(userOpt.get());
        }
    }

    public boolean usernameExists(String username) {
        return userRepository.findByUsername(username).isPresent();
    }

    public boolean usernameExistsIgnoreCase(String username) {
        return userRepository.findByUsernameIgnoreCase(username).isPresent();
    }

    public boolean hasUsers() {
        long userCount = userRepository.count();
        if (userRepository
                .findByUsernameIgnoreCase(Role.INTERNAL_API_USER.getRoleId())
                .isPresent()) {
            userCount -= 1;
        }
        return userCount > 0;
    }

    public void updateUserSettings(String username, Map<String, String> updates)
            throws IOException {
        Optional<User> userOpt = userRepository.findByUsernameIgnoreCase(username);
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
            databaseBackupHelper.exportDatabase();
        }
    }

    public Optional<User> findByUsername(String username) {
        return userRepository.findByUsername(username);
    }

    public Optional<User> findByUsernameIgnoreCase(String username) {
        return userRepository.findByUsernameIgnoreCase(username);
    }

    public Authority findRole(User user) {
        return authorityRepository.findByUserId(user.getId());
    }

    public void changeUsername(User user, String newUsername)
            throws IllegalArgumentException, IOException {
        if (!isUsernameValid(newUsername)) {
            throw new IllegalArgumentException(getInvalidUsernameMessage());
        }
        user.setUsername(newUsername);
        userRepository.save(user);
        databaseBackupHelper.exportDatabase();
    }

    public void changePassword(User user, String newPassword) throws IOException {
        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        databaseBackupHelper.exportDatabase();
    }

    public void changeFirstUse(User user, boolean firstUse) throws IOException {
        user.setFirstLogin(firstUse);
        userRepository.save(user);
        databaseBackupHelper.exportDatabase();
    }

    public void changeRole(User user, String newRole) {
        Authority userAuthority = this.findRole(user);
        userAuthority.setAuthority(newRole);
        authorityRepository.save(userAuthority);
    }

    public boolean isPasswordCorrect(User user, String currentPassword) {
        return passwordEncoder.matches(currentPassword, user.getPassword());
    }

    public boolean isUsernameValid(String username) {
        // Checks whether the simple username is formatted correctly
        boolean isValidSimpleUsername =
                username.matches("^[a-zA-Z0-9][a-zA-Z0-9@._+-]*[a-zA-Z0-9]$");
        // Checks whether the email address is formatted correctly
        boolean isValidEmail =
                username.matches(
                        "^(?=.{1,64}@)[A-Za-z0-9]+(\\.[A-Za-z0-9_+.-]+)*@[^-][A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)*(\\.[A-Za-z]{2,})$");
        return isValidSimpleUsername || isValidEmail;
    }

    private String getInvalidUsernameMessage() {
        return messageSource.getMessage(
                "invalidUsernameMessage", null, LocaleContextHolder.getLocale());
    }

    public boolean hasPassword(String username) {
        Optional<User> user = userRepository.findByUsernameIgnoreCase(username);
        return user.isPresent() && user.get().hasPassword();
    }

    public boolean isAuthenticationTypeByUsername(
            String username, AuthenticationType authenticationType) {
        Optional<User> user = userRepository.findByUsernameIgnoreCase(username);
        return user.isPresent()
                && authenticationType.name().equalsIgnoreCase(user.get().getAuthenticationType());
    }
}
