package stirling.software.SPDF.config.security;

import java.sql.SQLException;
import java.util.UUID;

import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.interfaces.DatabaseInterface;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.Role;
import stirling.software.SPDF.model.exception.UnsupportedProviderException;

@Slf4j
@Component
@RequiredArgsConstructor
public class InitialSecuritySetup {

    private final UserService userService;

    private final ApplicationProperties applicationProperties;

    private final DatabaseInterface databaseService;

    @PostConstruct
    public void init() {
        try {

            if (!userService.hasUsers()) {
                if (databaseService.hasBackup()) {
                    databaseService.importDatabase();
                } else {
                    initializeAdminUser();
                }
            }

            userService.migrateOauth2ToSSO();
            initializeInternalApiUser();
        } catch (IllegalArgumentException | SQLException | UnsupportedProviderException e) {
            log.error("Failed to initialize security setup.", e);
            System.exit(1);
        }
    }

    private void initializeAdminUser() throws SQLException, UnsupportedProviderException {
        String initialUsername =
                applicationProperties.getSecurity().getInitialLogin().getUsername();
        String initialPassword =
                applicationProperties.getSecurity().getInitialLogin().getPassword();
        if (initialUsername != null
                && !initialUsername.isEmpty()
                && initialPassword != null
                && !initialPassword.isEmpty()
                && userService.findByUsernameIgnoreCase(initialUsername).isEmpty()) {

            userService.saveUser(initialUsername, initialPassword, Role.ADMIN.getRoleId());
            log.info("Admin user created: {}", initialUsername);
        } else {
            createDefaultAdminUser();
        }
    }

    private void createDefaultAdminUser() throws SQLException, UnsupportedProviderException {
        String defaultUsername = "admin";
        String defaultPassword = "stirling";

        if (userService.findByUsernameIgnoreCase(defaultUsername).isEmpty()) {
            userService.saveUser(defaultUsername, defaultPassword, Role.ADMIN.getRoleId(), true);
            log.info("Default admin user created: {}", defaultUsername);
        }
    }

    private void initializeInternalApiUser()
            throws IllegalArgumentException, SQLException, UnsupportedProviderException {
        if (!userService.usernameExistsIgnoreCase(Role.INTERNAL_API_USER.getRoleId())) {
            userService.saveUser(
                    Role.INTERNAL_API_USER.getRoleId(),
                    UUID.randomUUID().toString(),
                    Role.INTERNAL_API_USER.getRoleId());
            userService.addApiKeyToUser(Role.INTERNAL_API_USER.getRoleId());
            log.info("Internal API user created: {}", Role.INTERNAL_API_USER.getRoleId());
        }
        userService.syncCustomApiUser(applicationProperties.getSecurity().getCustomGlobalAPIKey());
    }
}
