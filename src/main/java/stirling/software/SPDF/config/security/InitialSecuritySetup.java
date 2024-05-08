package stirling.software.SPDF.config.security;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.Role;

@Component
public class InitialSecuritySetup {

    @Autowired private UserService userService;

    @Autowired ApplicationProperties applicationProperties;

    @PostConstruct
    public void init() {
        if (!userService.hasUsers()) {

            String initialUsername =
                    applicationProperties.getSecurity().getInitialLogin().getUsername();
            String initialPassword =
                    applicationProperties.getSecurity().getInitialLogin().getPassword();
            if (initialUsername != null && initialPassword != null) {
                userService.saveUser(initialUsername, initialPassword, Role.ADMIN.getRoleId());
            } else {
                initialUsername = "admin";
                initialPassword = "stirling";
                userService.saveUser(
                        initialUsername, initialPassword, Role.ADMIN.getRoleId(), true);
            }
        }
        if (!userService.usernameExistsIgnoreCase(Role.INTERNAL_API_USER.getRoleId())) {
            userService.saveUser(
                    Role.INTERNAL_API_USER.getRoleId(),
                    UUID.randomUUID().toString(),
                    Role.INTERNAL_API_USER.getRoleId());
            userService.addApiKeyToUser(Role.INTERNAL_API_USER.getRoleId());
        }
    }

    @PostConstruct
    public void initSecretKey() throws IOException {
        String secretKey = applicationProperties.getAutomaticallyGenerated().getKey();
        if (!isValidUUID(secretKey)) {
            secretKey = UUID.randomUUID().toString(); // Generating a random UUID as the secret key
            saveKeyToConfig(secretKey);
        }
    }

    private void saveKeyToConfig(String key) throws IOException {
        Path path = Paths.get("configs", "settings.yml"); // Target the configs/settings.yml
        List<String> lines = Files.readAllLines(path);
        boolean keyFound = false;

        // Search for the existing key to replace it or place to add it
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).startsWith("AutomaticallyGenerated:")) {
                keyFound = true;
                if (i + 1 < lines.size() && lines.get(i + 1).trim().startsWith("key:")) {
                    lines.set(i + 1, "  key: " + key);
                    break;
                } else {
                    lines.add(i + 1, "  key: " + key);
                    break;
                }
            }
        }

        // If the section doesn't exist, append it
        if (!keyFound) {
            lines.add("# Automatically Generated Settings (Do Not Edit Directly)");
            lines.add("AutomaticallyGenerated:");
            lines.add("  key: " + key);
        }

        // Write back to the file
        Files.write(path, lines);
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
