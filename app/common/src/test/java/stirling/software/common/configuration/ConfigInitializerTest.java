package stirling.software.common.configuration;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.snakeyaml.engine.v2.api.LoadSettings;

import stirling.software.common.util.YamlHelper;

class ConfigInitializerTest {

    private static final LoadSettings LOAD_SETTINGS =
            LoadSettings.builder()
                    .setUseMarks(true)
                    .setMaxAliasesForCollections(Integer.MAX_VALUE)
                    .setAllowRecursiveKeys(true)
                    .setParseComments(true)
                    .build();

    // Mirrors the proFeatures block of settings.yml.template after the camelCase rename.
    private static final String CAMEL_CASE_TEMPLATE =
            """
            premium:
              proFeatures:
                ssoAutoLogin: false
                customMetadata:
                  autoUpdateMetadata: false
                  author: username
                  creator: Stirling-PDF
                  producer: Stirling-PDF
            """;

    @Test
    void migrateWatchReconcileDefault_lowersTheOldShippedDefault() {
        YamlHelper existing =
                new YamlHelper(
                        LOAD_SETTINGS,
                        """
                        policies:
                          scheduleSweepSeconds: 60
                          watchReconcileSeconds: 300
                        """);

        new ConfigInitializer().migrateWatchReconcileDefault(existing);

        assertEquals("60", existing.getValueByExactKeyPath("policies", "watchReconcileSeconds"));
        // Untouched neighbours prove the rewrite is scoped to the one key.
        assertEquals("60", existing.getValueByExactKeyPath("policies", "scheduleSweepSeconds"));
    }

    @Test
    void migrateWatchReconcileDefault_keepsADeliberateValue() {
        YamlHelper existing =
                new YamlHelper(
                        LOAD_SETTINGS,
                        """
                        policies:
                          watchReconcileSeconds: 900
                        """);

        new ConfigInitializer().migrateWatchReconcileDefault(existing);

        assertEquals("900", existing.getValueByExactKeyPath("policies", "watchReconcileSeconds"));
    }

    @Test
    void migrateWatchReconcileDefault_toleratesAMissingKey() {
        YamlHelper existing =
                new YamlHelper(LOAD_SETTINGS, "policies:\n  scheduleSweepSeconds: 60\n");

        assertDoesNotThrow(() -> new ConfigInitializer().migrateWatchReconcileDefault(existing));
    }

    @Test
    void migrateProFeaturesKeyCasing_carriesForwardLegacyPascalCaseValues() {
        // An existing install whose settings.yml still uses the old PascalCase keys.
        String legacy =
                """
                premium:
                  proFeatures:
                    SSOAutoLogin: true
                    CustomMetadata:
                      autoUpdateMetadata: true
                      author: alice
                      creator: bob
                      producer: carol
                """;
        YamlHelper template = new YamlHelper(LOAD_SETTINGS, CAMEL_CASE_TEMPLATE);
        YamlHelper existing = new YamlHelper(LOAD_SETTINGS, legacy);

        new ConfigInitializer().migrateProFeaturesKeyCasing(existing, template);

        assertEquals(
                "true", template.getValueByExactKeyPath("premium", "proFeatures", "ssoAutoLogin"));
        assertEquals(
                "true",
                template.getValueByExactKeyPath(
                        "premium", "proFeatures", "customMetadata", "autoUpdateMetadata"));
        assertEquals(
                "alice",
                template.getValueByExactKeyPath(
                        "premium", "proFeatures", "customMetadata", "author"));
        assertEquals(
                "bob",
                template.getValueByExactKeyPath(
                        "premium", "proFeatures", "customMetadata", "creator"));
        assertEquals(
                "carol",
                template.getValueByExactKeyPath(
                        "premium", "proFeatures", "customMetadata", "producer"));
    }

    @Test
    void migrateProFeaturesKeyCasing_withoutLegacyKeys_keepsTemplateDefaults() {
        // No PascalCase keys present -> this migration step must be a no-op.
        String alreadyCamel =
                """
                premium:
                  proFeatures:
                    ssoAutoLogin: true
                    customMetadata:
                      author: dave
                """;
        YamlHelper template = new YamlHelper(LOAD_SETTINGS, CAMEL_CASE_TEMPLATE);
        YamlHelper existing = new YamlHelper(LOAD_SETTINGS, alreadyCamel);

        new ConfigInitializer().migrateProFeaturesKeyCasing(existing, template);

        assertEquals(
                "false", template.getValueByExactKeyPath("premium", "proFeatures", "ssoAutoLogin"));
        assertEquals(
                "username",
                template.getValueByExactKeyPath(
                        "premium", "proFeatures", "customMetadata", "author"));
    }
}
