package stirling.software.SPDF.config;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;

public class ConfigInitializer implements ApplicationContextInitializer<ConfigurableApplicationContext> {

    @Override
    public void initialize(ConfigurableApplicationContext applicationContext) {
        try {
            ensureConfigExists();
        } catch (IOException e) {
            throw new RuntimeException("Failed to initialize application configuration", e);
        }
    }

	public void ensureConfigExists() throws IOException {
		// Define the path to the external config directory
		Path destPath = Paths.get("configs", "settings.yml");

		// Check if the file already exists
		if (Files.notExists(destPath)) {
			// Ensure the destination directory exists
			Files.createDirectories(destPath.getParent());

			// Copy the resource from classpath to the external directory
			try (InputStream in = getClass().getClassLoader().getResourceAsStream("settings.yml.template")) {
				if (in != null) {
					Files.copy(in, destPath);
				} else {
					throw new FileNotFoundException("Resource file not found: settings.yml.template");
				}
			}
		}
	}
}
