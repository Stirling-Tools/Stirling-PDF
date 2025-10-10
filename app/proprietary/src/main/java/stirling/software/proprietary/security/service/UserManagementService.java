package stirling.software.proprietary.security.service;

import java.sql.SQLException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.common.service.UserManagementServiceInterface;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;

/**
 * Implementation of user management service with 5-user limit enforcement.
 */
@Slf4j
@Service
@Qualifier("userManagementService")
@RequiredArgsConstructor
public class UserManagementService implements UserManagementServiceInterface {

    private final UserService userService;
    private final UserRepository userRepository;
    private final PasswordPolicyService passwordPolicyService;
    private final UserLimitEnforcementService userLimitService;
    private final PasswordEncoder passwordEncoder;
    private final DatabaseServiceInterface databaseService;

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    @Override
    @Transactional
    public UserDto createUser(CreateUserRequest request) throws UserLimitExceededException, IllegalArgumentException {
        log.info("Creating new user: {}", request.getUsername());

        try {
            // Check user limit
            userLimitService.validateUserCreation();

            // Validate username
            if (!userService.isUsernameValid(request.getUsername())) {
                throw new IllegalArgumentException("Invalid username format");
            }

            // Check if username already exists
            if (userService.usernameExistsIgnoreCase(request.getUsername())) {
                throw new IllegalArgumentException("Username already exists");
            }

            // Validate password
            if (!passwordPolicyService.validatePassword(request.getPassword())) {
                var errors = passwordPolicyService.getValidationErrors(request.getPassword());
                throw new IllegalArgumentException("Password does not meet requirements: " + errors);
            }

            // Determine role
            String role = request.getRole();
            if (role == null || role.isEmpty()) {
                role = Role.USER.getRoleId();
            }

            // Create user
            User user = userService.saveUser(
                request.getUsername(),
                request.getPassword(),
                (Long) null, // teamId
                role,
                false // not first login since admin is creating
            );

            // Set enabled status
            if (!request.isEnabled()) {
                userService.changeUserEnabled(user, false);
            }

            log.info("User created successfully: {}", request.getUsername());

            return convertToDto(user);

        } catch (UserLimitEnforcementService.UserLimitExceededException e) {
            throw new UserLimitExceededException(e.getMessage());
        } catch (SQLException | UnsupportedProviderException e) {
            log.error("Error creating user: {}", e.getMessage(), e);
            throw new IllegalArgumentException("Failed to create user: " + e.getMessage());
        }
    }

    @Override
    @Transactional
    public UserDto updateUser(Long userId, UpdateUserRequest request) throws IllegalArgumentException {
        log.info("Updating user with ID: {}", userId);

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            throw new IllegalArgumentException("User not found");
        }

        User user = userOpt.get();

        try {
            // Update role if provided
            if (request.getRole() != null && !request.getRole().isEmpty()) {
                userService.changeRole(user, request.getRole());
            }

            // Update enabled status if provided
            if (request.getEnabled() != null) {
                userService.changeUserEnabled(user, request.getEnabled());
            }

            // Update settings if provided
            if (request.getSettings() != null && !request.getSettings().isEmpty()) {
                userService.updateUserSettings(user.getUsername(), request.getSettings());
            }

            // Note: Email update would require adding an email field to the User entity

            log.info("User updated successfully: {}", user.getUsername());

            return convertToDto(user);

        } catch (SQLException | UnsupportedProviderException e) {
            log.error("Error updating user: {}", e.getMessage(), e);
            throw new IllegalArgumentException("Failed to update user: " + e.getMessage());
        }
    }

    @Override
    @Transactional
    public void deleteUser(Long userId) throws IllegalArgumentException {
        log.info("Deleting user with ID: {}", userId);

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            throw new IllegalArgumentException("User not found");
        }

        User user = userOpt.get();

        // Prevent deletion of internal API user
        if (user.getAuthorities().stream()
            .anyMatch(a -> a.getAuthority().equals(Role.INTERNAL_API_USER.getRoleId()))) {
            throw new IllegalArgumentException("Cannot delete internal system user");
        }

        // Prevent deletion of last admin
        if (user.getAuthorities().stream()
            .anyMatch(a -> a.getAuthority().equals(Role.ADMIN.getRoleId()))) {

            long adminCount = userRepository.findAll().stream()
                .filter(u -> u.getAuthorities().stream()
                    .anyMatch(a -> a.getAuthority().equals(Role.ADMIN.getRoleId())))
                .count();

            if (adminCount <= 1) {
                throw new IllegalArgumentException("Cannot delete the last admin user");
            }
        }

        userService.deleteUser(user.getUsername());

        log.info("User deleted successfully: {}", user.getUsername());
    }

    @Override
    public void setUserEnabled(Long userId, boolean enabled) {
        log.info("Setting user {} enabled status to: {}", userId, enabled);

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            throw new IllegalArgumentException("User not found");
        }

        try {
            userService.changeUserEnabled(userOpt.get(), enabled);
        } catch (SQLException | UnsupportedProviderException e) {
            log.error("Error updating user enabled status: {}", e.getMessage(), e);
            throw new IllegalArgumentException("Failed to update user status: " + e.getMessage());
        }
    }

    @Override
    public List<UserDto> listUsers() {
        return userRepository.findAll().stream()
            .filter(user -> !user.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals(Role.INTERNAL_API_USER.getRoleId())))
            .map(this::convertToDto)
            .collect(Collectors.toList());
    }

    @Override
    public UserDto getUser(Long userId) {
        return userRepository.findById(userId)
            .map(this::convertToDto)
            .orElse(null);
    }

    @Override
    public UserDto getUserByUsername(String username) {
        return userService.findByUsernameIgnoreCase(username)
            .map(this::convertToDto)
            .orElse(null);
    }

    @Override
    public boolean canCreateUser() {
        return userLimitService.canCreateUser();
    }

    @Override
    public int getUserCount() {
        return userLimitService.getUserCount();
    }

    @Override
    public int getMaxUserLimit() {
        return userLimitService.getMaxUserLimit();
    }

    @Override
    @Transactional
    public void resetUserPassword(Long userId, String newPassword) throws IllegalArgumentException {
        log.info("Resetting password for user ID: {}", userId);

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            throw new IllegalArgumentException("User not found");
        }

        // Validate password
        if (!passwordPolicyService.validatePassword(newPassword)) {
            var errors = passwordPolicyService.getValidationErrors(newPassword);
            throw new IllegalArgumentException("Password does not meet requirements: " + errors);
        }

        try {
            userService.changePassword(userOpt.get(), newPassword);
            log.info("Password reset successfully for user: {}", userOpt.get().getUsername());
        } catch (SQLException | UnsupportedProviderException e) {
            log.error("Error resetting password: {}", e.getMessage(), e);
            throw new IllegalArgumentException("Failed to reset password: " + e.getMessage());
        }
    }

    @Override
    @Transactional
    public void forcePasswordChange(Long userId) {
        log.info("Forcing password change for user ID: {}", userId);

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            throw new IllegalArgumentException("User not found");
        }

        try {
            userService.changeFirstUse(userOpt.get(), true);
            log.info("Password change forced for user: {}", userOpt.get().getUsername());
        } catch (SQLException | UnsupportedProviderException e) {
            log.error("Error forcing password change: {}", e.getMessage(), e);
            throw new IllegalArgumentException("Failed to force password change: " + e.getMessage());
        }
    }

    /**
     * Convert User entity to UserDto.
     */
    private UserDto convertToDto(User user) {
        UserDto dto = new UserDto();
        dto.setId(user.getId());
        dto.setUsername(user.getUsername());
        // Email would need to be added to User entity
        dto.setEmail(null);
        dto.setRole(user.getRoleName());
        dto.setEnabled(user.isEnabled());
        dto.setFirstLogin(user.isFirstLogin());
        dto.setAuthenticationType(user.getAuthenticationType());

        // Set timestamps (would need to be added to User entity for full implementation)
        dto.setCreatedAt(LocalDateTime.now().format(DATE_FORMATTER));
        dto.setLastLoginAt(null);

        return dto;
    }
}