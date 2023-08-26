package stirling.software.SPDF.config.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import stirling.software.SPDF.model.ApplicationProperties;
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

	@Autowired
	ApplicationProperties applicationProperties;
	
	@PostConstruct
	public void init() {
		if (!userService.hasUsers()) {
			String initialUsername = applicationProperties.getSecurity().getInitialLogin().getUsername();
			String initialPassword = applicationProperties.getSecurity().getInitialLogin().getPassword();
			if (initialUsername != null && initialPassword != null) {
				userService.saveUser(initialUsername, initialPassword, Role.ADMIN.getRoleId());
			}

		}
	}



	@PostConstruct
	public void initSecretKey() throws IOException {
		String secretKey = applicationProperties.getAutomaticallyGenerated().getKey();
		if (secretKey == null || secretKey.isEmpty()) {
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
}