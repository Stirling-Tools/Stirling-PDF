package stirling.software.SPDF.integrationtests;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import stirling.software.SPDF.SPDFApplication;
import static java.nio.file.Files.createDirectories;
import static java.nio.file.Files.createFile;
import static java.nio.file.Files.delete;
import static java.nio.file.Files.exists;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
public class SPDFApplicationIntegrationTest {

    @Test
    public void testMainApplicationStartup() throws IOException, InterruptedException {
        // Setup mock environment for the main method
        Path configPath = Path.of("test/configs");
        Path settingsPath = Paths.get("test/configs/settings.yml");
        Path customSettingsPath = Paths.get("test/configs/custom_settings.yml");
        Path staticPath = Path.of("test/customFiles/static/");
        Path templatesPath = Path.of("test/customFiles/templates/");

        // Ensure the files do not exist for the test
        if (exists(settingsPath)) {
            delete(settingsPath);
        }
        if (exists(customSettingsPath)) {
            delete(customSettingsPath);
        }
        if (exists(staticPath)) {
            delete(staticPath);
        }
        if (exists(templatesPath)) {
            delete(templatesPath);
        }

        // Ensure the directories are created for testing
        createDirectories(configPath);
        createDirectories(staticPath);
        createDirectories(templatesPath);

        createFile(settingsPath);
        createFile(customSettingsPath);

        // Run the main method
        SPDFApplication.main(new String[] {"-Dspring.profiles.active=default"});

        // Verify that the directories were created
        assertTrue(exists(settingsPath));
        assertTrue(exists(customSettingsPath));
        assertTrue(exists(staticPath));
        assertTrue(exists(templatesPath));
    }
}
