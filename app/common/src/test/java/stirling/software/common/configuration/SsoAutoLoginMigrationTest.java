package stirling.software.common.configuration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.snakeyaml.engine.v2.api.LoadSettings;

import stirling.software.common.util.YamlHelper;

class SsoAutoLoginMigrationTest {

    private YamlHelper yaml(String value) {
        return new YamlHelper(LoadSettings.builder().build(), value);
    }

    @ParameterizedTest
    @CsvSource({
        "premium, ssoAutoLogin, true",
        "premium, ssoAutoLogin, false",
        "premium, SSOAutoLogin, true",
        "premium, SSOAutoLogin, false",
        "enterpriseEdition, ssoAutoLogin, true",
        "enterpriseEdition, ssoAutoLogin, false",
        "enterpriseEdition, SSOAutoLogin, true",
        "enterpriseEdition, SSOAutoLogin, false"
    })
    void migratesLegacyValues(String section, String key, String value) {
        String source =
                section.equals("premium")
                        ? "premium:\n  proFeatures:\n    " + key + ": " + value
                        : "enterpriseEdition:\n  " + key + ": " + value;
        YamlHelper template = yaml("security:\n  ssoAutoLogin: " + !Boolean.parseBoolean(value));

        new ConfigInitializer().migrateSsoAutoLoginToSecurity(yaml(source), template);

        assertEquals(value, template.getValueByExactKeyPath("security", "ssoAutoLogin"));
    }

    @Test
    void explicitSecurityFalseOverridesLegacyTrue() {
        YamlHelper source =
                yaml(
                        "security:\n  ssoAutoLogin: false\npremium:\n  proFeatures:\n    ssoAutoLogin: true");
        YamlHelper template = yaml("security:\n  ssoAutoLogin: false");

        new ConfigInitializer().migrateSsoAutoLoginToSecurity(source, template);
        template.updateValuesFromYaml(source, template);

        assertEquals("false", template.getValueByExactKeyPath("security", "ssoAutoLogin"));
    }

    @Test
    void currentProKeyOverridesOlderKeysEvenWhenFalse() {
        YamlHelper source =
                yaml(
                        "premium:\n  proFeatures:\n    ssoAutoLogin: false\n    SSOAutoLogin: true\nenterpriseEdition:\n  SSOAutoLogin: true");
        YamlHelper template = yaml("security:\n  ssoAutoLogin: true");

        new ConfigInitializer().migrateSsoAutoLoginToSecurity(source, template);

        assertEquals("false", template.getValueByExactKeyPath("security", "ssoAutoLogin"));
    }
}
