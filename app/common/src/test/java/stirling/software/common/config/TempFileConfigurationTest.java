package stirling.software.common.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileRegistry;

public class TempFileConfigurationTest {

    @TempDir Path tempDir;

    @Test
    void tempFileRegistryBeanProvidesInstance() {
        ApplicationProperties properties = new ApplicationProperties();
        TempFileConfiguration configuration = new TempFileConfiguration(properties);

        TempFileRegistry registry = configuration.tempFileRegistry();

        assertNotNull(registry, "TempFileRegistry bean should not be null");
    }

    @Test
    void initTempFileConfigCreatesMissingDirectory() {
        ApplicationProperties properties = new ApplicationProperties();
        Path customTempDir = tempDir.resolve("custom-temp");
        properties.getSystem().getTempFileManagement().setBaseTmpDir(customTempDir.toString());
        TempFileConfiguration configuration = new TempFileConfiguration(properties);

        configuration.initTempFileConfig();

        assertTrue(Files.exists(customTempDir), "Custom temp directory should be created");
    }

    @Test
    void initTempFileConfigHandlesExistingDirectory() throws Exception {
        ApplicationProperties properties = new ApplicationProperties();
        Path existingDir = Files.createDirectories(tempDir.resolve("existing-temp"));
        properties.getSystem().getTempFileManagement().setBaseTmpDir(existingDir.toString());
        TempFileConfiguration configuration = new TempFileConfiguration(properties);

        assertDoesNotThrow(configuration::initTempFileConfig);
        assertTrue(
                Files.exists(existingDir), "Existing directory should remain after initialization");
    }
}
