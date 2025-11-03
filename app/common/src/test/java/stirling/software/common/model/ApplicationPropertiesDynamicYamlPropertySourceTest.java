package stirling.software.common.model;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.StandardEnvironment;

import stirling.software.common.configuration.InstallationPathConfig;

class ApplicationPropertiesDynamicYamlPropertySourceTest {

    @Test
    void loads_yaml_into_environment() throws Exception {
        String yaml =
                """
                \
                ui:
                  appName: "My App"
                system:
                  enableAnalytics: true
                """;
        Path tmp = Files.createTempFile("spdf-settings-", ".yml");
        Files.writeString(tmp, yaml);

        try (MockedStatic<InstallationPathConfig> mocked =
                Mockito.mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getSettingsPath).thenReturn(tmp.toString());

            ConfigurableEnvironment env = new StandardEnvironment();
            ApplicationProperties props = new ApplicationProperties();

            props.dynamicYamlPropertySource(env);

            assertEquals("My App", env.getProperty("ui.appName"));
            assertEquals("true", env.getProperty("system.enableAnalytics"));
        }
    }

    @Test
    void throws_when_settings_file_missing() {
        String missing = "/path/does/not/exist/spdf.yml";
        try (MockedStatic<InstallationPathConfig> mocked =
                Mockito.mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getSettingsPath).thenReturn(missing);

            ConfigurableEnvironment env = new StandardEnvironment();
            ApplicationProperties props = new ApplicationProperties();

            assertThrows(IOException.class, () -> props.dynamicYamlPropertySource(env));
        }
    }
}
