package stirling.software.common.configuration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mockStatic;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;

import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.YamlHelper;

/**
 * End-to-end check of the container-restart path. {@link ConfigInitializer#ensureConfigExists()} is
 * what runs on every startup, merging the on-disk settings.yml with the bundled
 * settings.yml.template. These tests exercise it against the real template on the classpath to
 * prove admin-saved proFeatures values survive a restart - the bug behind "the SSO auto-login
 * button resets every time the container resets".
 */
class ConfigInitializerRestartTest {

    private static String read(Path settings, String... keyPath) throws IOException {
        return String.valueOf(new YamlHelper(settings).getValueByExactKeyPath(keyPath));
    }

    @Test
    void ssoAutoLoginAndCustomMetadata_persistAcrossRestart(@TempDir Path tmp) throws Exception {
        Path settings = tmp.resolve("settings.yml");
        Path custom = tmp.resolve("custom_settings.yml");

        try (MockedStatic<InstallationPathConfig> paths =
                mockStatic(InstallationPathConfig.class)) {
            paths.when(InstallationPathConfig::getSettingsPath).thenReturn(settings.toString());
            paths.when(InstallationPathConfig::getCustomSettingsPath).thenReturn(custom.toString());

            ConfigInitializer init = new ConfigInitializer();

            // First boot: settings.yml created from the bundled template (camelCase, default off).
            init.ensureConfigExists();
            assertEquals("false", read(settings, "premium", "proFeatures", "ssoAutoLogin"));

            // Admin enables SSO auto-login and edits custom metadata via the exact save path the
            // admin settings controller uses.
            GeneralUtils.saveKeyToSettings("premium.proFeatures.ssoAutoLogin", true);
            GeneralUtils.saveKeyToSettings("premium.proFeatures.customMetadata.author", "acme");

            // Container restart: ensureConfigExists merges the saved file with the template again.
            init.ensureConfigExists();

            assertEquals("true", read(settings, "premium", "proFeatures", "ssoAutoLogin"));
            assertEquals(
                    "acme", read(settings, "premium", "proFeatures", "customMetadata", "author"));
        }
    }

    /**
     * The admin UI only submits the fields it changed, so a nested block such as storage.sharing
     * arrives as a partial map. Persisting it must not drop the siblings, otherwise the next
     * restart resets them to the template defaults - the bug behind "enabling email sharing turns
     * Enable Sharing back off after a restart".
     */
    @Test
    void partialSharingSave_keepsSiblingsAcrossRestart(@TempDir Path tmp) throws Exception {
        Path settings = tmp.resolve("settings.yml");
        Path custom = tmp.resolve("custom_settings.yml");

        try (MockedStatic<InstallationPathConfig> paths =
                mockStatic(InstallationPathConfig.class)) {
            paths.when(InstallationPathConfig::getSettingsPath).thenReturn(settings.toString());
            paths.when(InstallationPathConfig::getCustomSettingsPath).thenReturn(custom.toString());

            ConfigInitializer init = new ConfigInitializer();
            init.ensureConfigExists();

            // Admin turns on storage and sharing, then restarts.
            GeneralUtils.saveKeyToSettings("storage.enabled", true);
            GeneralUtils.saveKeyToSettings("storage.sharing.enabled", true);
            init.ensureConfigExists();

            // Admin now flips only "Enable Email Sharing", then restarts again. Both the leaf key
            // the controller writes today and the whole-block map an older client may send have to
            // leave the siblings alone.
            GeneralUtils.saveKeyToSettings("storage.sharing.emailEnabled", true);
            GeneralUtils.saveKeyToSettings("storage.sharing", Map.of("emailEnabled", true));
            init.ensureConfigExists();

            assertEquals("true", read(settings, "storage", "enabled"));
            assertEquals("true", read(settings, "storage", "sharing", "enabled"));
            assertEquals("true", read(settings, "storage", "sharing", "emailEnabled"));
            assertEquals("true", read(settings, "storage", "sharing", "linkEnabled"));
            assertEquals("3", read(settings, "storage", "sharing", "linkExpirationDays"));
        }
    }

    @Test
    void legacyPascalCaseConfig_isMigratedAndPreservedOnRestart(@TempDir Path tmp)
            throws Exception {
        Path settings = tmp.resolve("settings.yml");
        Path custom = tmp.resolve("custom_settings.yml");

        try (MockedStatic<InstallationPathConfig> paths =
                mockStatic(InstallationPathConfig.class)) {
            paths.when(InstallationPathConfig::getSettingsPath).thenReturn(settings.toString());
            paths.when(InstallationPathConfig::getCustomSettingsPath).thenReturn(custom.toString());

            ConfigInitializer init = new ConfigInitializer();

            // Seed a full settings.yml as an OLD install would have written it: PascalCase keys
            // with
            // SSO auto-login enabled.
            init.ensureConfigExists();
            String legacy =
                    Files.readString(settings)
                            .replace("ssoAutoLogin: false", "SSOAutoLogin: true")
                            .replace("customMetadata:", "CustomMetadata:");
            Files.writeString(settings, legacy);

            // Upgrade restart.
            init.ensureConfigExists();

            // Value carried forward onto the new camelCase key; the legacy PascalCase key is gone.
            assertEquals("true", read(settings, "premium", "proFeatures", "ssoAutoLogin"));
            assertNull(
                    new YamlHelper(settings)
                            .getValueByExactKeyPath("premium", "proFeatures", "SSOAutoLogin"));
        }
    }
}
