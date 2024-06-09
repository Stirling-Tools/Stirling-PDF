package stirling.software.SPDF.utils;

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

import stirling.software.SPDF.SPdfApplication;
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
        Path settingsPath = Paths.get("configs/settings.yml");
        Path customSettingsPath = Paths.get("configs/custom_settings.yml");

        // Ensure the files do not exist for the test
        if (Files.exists(settingsPath)) {
            Files.delete(settingsPath);
        }
        if (Files.exists(customSettingsPath)) {
            Files.delete(customSettingsPath);
        }

        // Run the main method
        SPdfApplication.main(new String[]{});

        // Verify that the directories were created
        assertTrue(Files.exists(Path.of("customFiles/static/")));
        assertTrue(Files.exists(Path.of("customFiles/templates/")));
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
