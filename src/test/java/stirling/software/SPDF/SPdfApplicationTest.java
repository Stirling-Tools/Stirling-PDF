package stirling.software.SPDF;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.env.Environment;

import stirling.software.SPDF.model.ApplicationProperties;

@ExtendWith(MockitoExtension.class)
public class SPdfApplicationTest {

    @Mock
    private Environment env;

    @Mock
    private ApplicationProperties applicationProperties;

    @InjectMocks
    private SPdfApplication sPdfApplication;

    @BeforeEach
    public void setUp() {
        sPdfApplication = new SPdfApplication();
        sPdfApplication.setServerPortStatic("8080");
    }

    @Test
    public void testSetServerPortStatic() {
        sPdfApplication.setServerPortStatic("9090");
        assertEquals("9090", SPdfApplication.getStaticPort());
    }

    @Test
    public void testMainApplicationStartup() throws IOException, InterruptedException {
        // Setup mock environment for the main method
        Path configPath = Path.of("test/configs");
        Path settingsPath = Paths.get("test/configs/settings.yml");
        Path customSettingsPath = Paths.get("test/configs/custom_settings.yml");
        Path staticPath = Path.of("test/customFiles/static/");
        Path templatesPath = Path.of("test/customFiles/templates/");

        // Ensure the files do not exist for the test
        if (Files.exists(settingsPath)) {
            Files.delete(settingsPath);
        }
        if (Files.exists(customSettingsPath)) {
            Files.delete(customSettingsPath);
        }
        if (Files.exists(staticPath)) {
            Files.delete(staticPath);
        }
        if (Files.exists(templatesPath)) {
            Files.delete(templatesPath);
        }

        // Ensure the directories are created for testing
        Files.createDirectories(configPath);
        Files.createDirectories(staticPath);
        Files.createDirectories(templatesPath);

        Files.createFile(settingsPath);
        Files.createFile(customSettingsPath);

        // Run the main method
        SPdfApplication.main(new String[]{});

        // Verify that the directories were created
        assertTrue(Files.exists(settingsPath));
        assertTrue(Files.exists(customSettingsPath));
        assertTrue(Files.exists(staticPath));
        assertTrue(Files.exists(templatesPath));
    }

    @Test
    public void testGetStaticPort() {
        assertEquals("8080", SPdfApplication.getStaticPort());
    }

    @Test
    public void testGetNonStaticPort() {
        assertEquals("8080", sPdfApplication.getNonStaticPort());
    }
}
