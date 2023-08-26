package stirling.software.SPDF.config.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import stirling.software.SPDF.model.Role;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.*;
import java.util.*;

import org.springframework.core.env.Environment;
import org.springframework.core.io.ClassPathResource;

@Component
public class InitialSetup {

    @Autowired
    private UserService userService;

    @PostConstruct
    public void init() {
        if(!userService.hasUsers()) {
            String initialUsername = System.getenv("INITIAL_USERNAME");
            String initialPassword = System.getenv("INITIAL_PASSWORD");
            if(initialUsername != null && initialPassword != null) {
                userService.saveUser(initialUsername, initialPassword, Role.ADMIN.getRoleId());
            }
             
        }
    }
    
    
    

    @Value("${AutomaticallyGeneratedDoNotEdit.key:}")
    private String secretKey;

    @Autowired
    private Environment environment;
    
    
    public void ensureConfigExists() throws IOException {
        // Define the path to the external config directory
        Path destPath = Paths.get("configs", "application.yml");

        // Check if the file already exists
        if (Files.notExists(destPath)) {
            // Ensure the destination directory exists
            Files.createDirectories(destPath.getParent());

            // Copy the resource from classpath to the external directory
            try (InputStream in = getClass().getClassLoader().getResourceAsStream("application.yml.template")) {
                if (in != null) {
                    Files.copy(in, destPath);
                } else {
                    throw new FileNotFoundException("Resource file not found: application.yml.template");
                }
            }
        }
    }

    @PostConstruct
    public void initSecretKey() throws IOException {
    	ensureConfigExists();
        if (secretKey == null || secretKey.isEmpty() || "placeholder".equals(secretKey)) {
            secretKey = UUID.randomUUID().toString(); // Generating a random UUID as the secret key
            saveKeyToConfig(secretKey);
        }
    }

    private void saveKeyToConfig(String key) throws IOException {
        Path path = Paths.get("configs", "application.yml");  // Target the configs/application.yml
        List<String> lines = Files.readAllLines(path);
        boolean keyFound = false;

        // Search for the existing key to replace it or place to add it
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).startsWith("AutomaticallyGeneratedDoNotEdit:")) {
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
            lines.add("AutomaticallyGeneratedDoNotEdit:");
            lines.add("  key: " + key);
        }

        // Add a comment (if not already added)
        if (!lines.get(0).startsWith("# Automatically Generated Settings (Do Not Edit Directly)")) {
            lines.add(0, "# Automatically Generated Settings (Do Not Edit Directly)");
        }

        // Write back to the file
        Files.write(path, lines);
    }

    
    
    
}
