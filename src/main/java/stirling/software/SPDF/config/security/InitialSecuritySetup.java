package stirling.software.SPDF.config.security;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

import org.simpleyaml.configuration.file.YamlFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.Role;

@Component
public class InitialSecuritySetup {

    @Autowired private UserService userService;

    @Autowired private ApplicationProperties applicationProperties;

    private static final Logger logger = LoggerFactory.getLogger(InitialSecuritySetup.class);

    @PostConstruct
    public void init() {
        if (!userService.hasUsers()) {
            initializeAdminUser();
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

    private void initializeAdminUser() {
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
                logger.info("Admin user created: " + initialUsername);
            } catch (IllegalArgumentException e) {
                logger.error("Failed to initialize security setup", e);
                System.exit(1);
            }
        } else {
            createDefaultAdminUser();
        }
    }

    private void createDefaultAdminUser() {
        String defaultUsername = "admin";
        String defaultPassword = "stirling";
        if (!userService.findByUsernameIgnoreCase(defaultUsername).isPresent()) {
            userService.saveUser(defaultUsername, defaultPassword, Role.ADMIN.getRoleId(), true);
            logger.info("Default admin user created: " + defaultUsername);
        }
    }

    private void initializeInternalApiUser() {
        if (!userService.usernameExistsIgnoreCase(Role.INTERNAL_API_USER.getRoleId())) {
            userService.saveUser(
                    Role.INTERNAL_API_USER.getRoleId(),
                    UUID.randomUUID().toString(),
                    Role.INTERNAL_API_USER.getRoleId());
            userService.addApiKeyToUser(Role.INTERNAL_API_USER.getRoleId());
            logger.info("Internal API user created: " + Role.INTERNAL_API_USER.getRoleId());
        }
    }

    private void saveKeyToConfig(String key) throws IOException {
        Path path = Paths.get("configs", "settings.yml"); // Target the configs/settings.yml

        final YamlFile settingsYml = new YamlFile(path.toFile());

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
