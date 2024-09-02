package stirling.software.SPDF.config.security;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

import org.simpleyaml.configuration.file.YamlFile;
import org.simpleyaml.configuration.implementation.SimpleYamlImplementation;
import org.simpleyaml.configuration.implementation.snakeyaml.lib.DumperOptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.config.DatabaseBackupInterface;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.Role;

@Component
@Slf4j
public class InitialSecuritySetup {

    @Autowired private UserService userService;

    @Autowired private ApplicationProperties applicationProperties;

    @Autowired private DatabaseBackupInterface databaseBackupHelper;

    @PostConstruct
    public void init() throws IllegalArgumentException, IOException {
        if (databaseBackupHelper.hasBackup() && !userService.hasUsers()) {
            databaseBackupHelper.importDatabase();
        } else if (!userService.hasUsers()) {
            initializeAdminUser();
        } else {
            databaseBackupHelper.exportDatabase();
        }
        initializeInternalApiUser();
    }

    @PostConstruct
    public void initSecretKey() throws IOException {
        String secretKey = applicationProperties.getAutomaticallyGenerated().getKey();
        if (!isValidUUID(secretKey)) {
            secretKey = UUID.randomUUID().toString(); // Generating a random UUID as the secret key
            saveKeyToConfig(secretKey);
        }
    }

    private void initializeAdminUser() throws IOException {
        String initialUsername =
                applicationProperties.getSecurity().getInitialLogin().getUsername();
        String initialPassword =
                applicationProperties.getSecurity().getInitialLogin().getPassword();
        if (initialUsername != null
                && !initialUsername.isEmpty()
                && initialPassword != null
                && !initialPassword.isEmpty()
                && !userService.findByUsernameIgnoreCase(initialUsername).isPresent()) {
            try {
                userService.saveUser(initialUsername, initialPassword, Role.ADMIN.getRoleId());
                log.info("Admin user created: " + initialUsername);
            } catch (IllegalArgumentException e) {
                log.error("Failed to initialize security setup", e);
                System.exit(1);
            }
        } else {
            createDefaultAdminUser();
        }
    }

    private void createDefaultAdminUser() throws IllegalArgumentException, IOException {
        String defaultUsername = "admin";
        String defaultPassword = "stirling";
        if (!userService.findByUsernameIgnoreCase(defaultUsername).isPresent()) {
            userService.saveUser(defaultUsername, defaultPassword, Role.ADMIN.getRoleId(), true);
            log.info("Default admin user created: " + defaultUsername);
        }
    }

    private void initializeInternalApiUser() throws IllegalArgumentException, IOException {
        if (!userService.usernameExistsIgnoreCase(Role.INTERNAL_API_USER.getRoleId())) {
            userService.saveUser(
                    Role.INTERNAL_API_USER.getRoleId(),
                    UUID.randomUUID().toString(),
                    Role.INTERNAL_API_USER.getRoleId());
            userService.addApiKeyToUser(Role.INTERNAL_API_USER.getRoleId());
            log.info("Internal API user created: " + Role.INTERNAL_API_USER.getRoleId());
        }
    }

    private void saveKeyToConfig(String key) throws IOException {
        Path path = Paths.get("configs", "settings.yml"); // Target the configs/settings.yml

        final YamlFile settingsYml = new YamlFile(path.toFile());
        DumperOptions yamlOptionssettingsYml =
                ((SimpleYamlImplementation) settingsYml.getImplementation()).getDumperOptions();
        yamlOptionssettingsYml.setSplitLines(false);

        settingsYml.loadWithComments();

        settingsYml
                .path("AutomaticallyGenerated.key")
                .set(key)
                .comment("# Automatically Generated Settings (Do Not Edit Directly)");
        settingsYml.save();
    }

    private boolean isValidUUID(String uuid) {
        if (uuid == null) {
            return false;
        }
        try {
            UUID.fromString(uuid);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
