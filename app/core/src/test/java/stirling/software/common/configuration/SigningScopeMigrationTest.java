package stirling.software.common.configuration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mockStatic;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.MockedStatic;

import stirling.software.common.util.YamlHelper;

class SigningScopeMigrationTest {
    @ParameterizedTest
    @CsvSource(
            value = {
                "team,-,team",
                "org,-,org",
                "team,org,org",
                "org,team,team",
                "-,team,team",
                "-,-,org"
            },
            nullValues = "-")
    void preservesScopeAndExplicitOverridesAcrossRestarts(
            String legacyScope, String signingScope, String expectedScope, @TempDir Path tmp)
            throws Exception {
        Path settings = tmp.resolve("settings.yml");
        Path custom = tmp.resolve("custom_settings.yml");
        String legacy =
                legacyScope == null
                        ? ""
                        : "  encryption:\n    userListScope: " + legacyScope + "\n";
        String current =
                signingScope == null ? "" : "  signing:\n    userListScope: " + signingScope + "\n";
        // Startup replaces files shorter than 31 lines instead of merging their settings.
        Files.writeString(
                settings,
                "# Existing installation\n".repeat(32)
                        + "storage:\n  enabled: true\n"
                        + legacy
                        + current);

        try (MockedStatic<InstallationPathConfig> paths =
                mockStatic(InstallationPathConfig.class)) {
            paths.when(InstallationPathConfig::getSettingsPath).thenReturn(settings.toString());
            paths.when(InstallationPathConfig::getCustomSettingsPath).thenReturn(custom.toString());
            ConfigInitializer initializer = new ConfigInitializer();
            initializer.ensureConfigExists();
            YamlHelper migrated = new YamlHelper(settings);
            assertEquals(
                    expectedScope,
                    migrated.getValueByExactKeyPath("storage", "signing", "userListScope"));
            assertNull(migrated.getValueByExactKeyPath("storage", "encryption", "userListScope"));

            initializer.ensureConfigExists();
            YamlHelper restarted = new YamlHelper(settings);
            assertEquals(
                    expectedScope,
                    restarted.getValueByExactKeyPath("storage", "signing", "userListScope"));
            assertEquals(migrated.getAllKeys(), restarted.getAllKeys());
        }
    }
}
