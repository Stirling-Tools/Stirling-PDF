package stirling.software.common.configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mockStatic;

import java.io.FileNotFoundException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;
import org.snakeyaml.engine.v2.api.LoadSettings;

import stirling.software.common.util.YamlHelper;

class ConfigInitializerMoreTest {

    private static final LoadSettings LOAD_SETTINGS =
            LoadSettings.builder()
                    .setUseMarks(true)
                    .setMaxAliasesForCollections(Integer.MAX_VALUE)
                    .setAllowRecursiveKeys(true)
                    .setParseComments(true)
                    .build();

    // Template after the enterpriseEdition -> premium rename.
    private static final String PREMIUM_TEMPLATE =
            """
            premium:
              enabled: false
              key: 0000
              proFeatures:
                ssoAutoLogin: false
                customMetadata:
                  autoUpdateMetadata: false
                  author: username
                  creator: Stirling-PDF
                  producer: Stirling-PDF
            """;

    @Nested
    @DisplayName("migrateEnterpriseEditionToPremium")
    class EnterpriseMigration {

        @Test
        @DisplayName("carries legacy enterpriseEdition values forward into premium block")
        void migratesLegacyEnterpriseValues() throws Exception {
            String legacy =
                    """
                    enterpriseEdition:
                      enabled: true
                      key: ABC-123
                      SSOAutoLogin: true
                      CustomMetadata:
                        autoUpdateMetadata: true
                        author: alice
                        creator: bob
                        producer: carol
                    """;
            YamlHelper template = new YamlHelper(LOAD_SETTINGS, PREMIUM_TEMPLATE);
            YamlHelper existing = new YamlHelper(LOAD_SETTINGS, legacy);

            invokeMigrate(existing, template);

            assertThat(template.getValueByExactKeyPath("premium", "enabled")).isEqualTo("true");
            assertThat(template.getValueByExactKeyPath("premium", "key")).isEqualTo("ABC-123");
            assertThat(template.getValueByExactKeyPath("premium", "proFeatures", "ssoAutoLogin"))
                    .isEqualTo("true");
            assertThat(
                            template.getValueByExactKeyPath(
                                    "premium",
                                    "proFeatures",
                                    "customMetadata",
                                    "autoUpdateMetadata"))
                    .isEqualTo("true");
            assertThat(
                            template.getValueByExactKeyPath(
                                    "premium", "proFeatures", "customMetadata", "author"))
                    .isEqualTo("alice");
            assertThat(
                            template.getValueByExactKeyPath(
                                    "premium", "proFeatures", "customMetadata", "creator"))
                    .isEqualTo("bob");
            assertThat(
                            template.getValueByExactKeyPath(
                                    "premium", "proFeatures", "customMetadata", "producer"))
                    .isEqualTo("carol");
        }

        @Test
        @DisplayName("no legacy enterpriseEdition block leaves template defaults intact")
        void noLegacyKeysIsNoOp() throws Exception {
            String noEnterprise =
                    """
                    security:
                      enableLogin: false
                    """;
            YamlHelper template = new YamlHelper(LOAD_SETTINGS, PREMIUM_TEMPLATE);
            YamlHelper existing = new YamlHelper(LOAD_SETTINGS, noEnterprise);

            invokeMigrate(existing, template);

            assertThat(template.getValueByExactKeyPath("premium", "enabled")).isEqualTo("false");
            assertThat(
                            template.getValueByExactKeyPath(
                                    "premium", "proFeatures", "customMetadata", "author"))
                    .isEqualTo("username");
        }

        private void invokeMigrate(YamlHelper yaml, YamlHelper template) throws Exception {
            var method =
                    ConfigInitializer.class.getDeclaredMethod(
                            "migrateEnterpriseEditionToPremium",
                            YamlHelper.class,
                            YamlHelper.class);
            method.setAccessible(true);
            method.invoke(new ConfigInitializer(), yaml, template);
        }
    }

    @Nested
    @DisplayName("ensureConfigExists - create branch (template absent on common classpath)")
    class EnsureConfigCreateBranch {

        @Test
        @DisplayName("no settings file -> attempts create, fails fast when template missing")
        void createWithoutTemplateThrows(@TempDir Path tempDir) throws Exception {
            Path settings = tempDir.resolve("configs").resolve("settings.yml");
            Path custom = tempDir.resolve("configs").resolve("custom_settings.yml");

            try (MockedStatic<InstallationPathConfig> mocked =
                    mockStatic(InstallationPathConfig.class)) {
                mocked.when(InstallationPathConfig::getSettingsPath)
                        .thenReturn(settings.toString());
                mocked.when(InstallationPathConfig::getCustomSettingsPath)
                        .thenReturn(custom.toString());

                // settings.yml.template is packaged in the core module, not common, so the
                // create branch must surface a FileNotFoundException here.
                assertThatThrownBy(() -> new ConfigInitializer().ensureConfigExists())
                        .isInstanceOf(FileNotFoundException.class);
            }
        }

        @Test
        @DisplayName("short existing settings file is backed up before recreate attempt")
        void shortFileIsBackedUp(@TempDir Path tempDir) throws Exception {
            Path configDir = Files.createDirectories(tempDir.resolve("configs"));
            Path settings = configDir.resolve("settings.yml");
            Path custom = configDir.resolve("custom_settings.yml");
            // Fewer than MIN_SETTINGS_FILE_LINES (31) lines triggers the recreate path.
            Files.writeString(settings, "a: 1\nb: 2\n");

            try (MockedStatic<InstallationPathConfig> mocked =
                    mockStatic(InstallationPathConfig.class)) {
                mocked.when(InstallationPathConfig::getSettingsPath)
                        .thenReturn(settings.toString());
                mocked.when(InstallationPathConfig::getCustomSettingsPath)
                        .thenReturn(custom.toString());

                assertThatThrownBy(() -> new ConfigInitializer().ensureConfigExists())
                        .isInstanceOf(FileNotFoundException.class);
            }

            // Original was moved to a timestamped .bak before the failed recreate.
            try (Stream<Path> files = Files.list(configDir)) {
                assertThat(files.anyMatch(p -> p.getFileName().toString().contains(".bak")))
                        .isTrue();
            }
            assertThat(Files.exists(settings)).isFalse();
        }
    }
}
