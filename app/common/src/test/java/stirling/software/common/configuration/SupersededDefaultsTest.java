package stirling.software.common.configuration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.snakeyaml.engine.v2.api.LoadSettings;

import stirling.software.common.util.YamlHelper;

class SupersededDefaultsTest {

    private static final String TEMPLATE =
            "mcp:\n  fileUrlAllowedHosts: ['oaiusercontent.com', 'openai.com', 'chatgpt.com',"
                    + " 'oaisdmntpr*.blob.core.windows.net']\n";

    private YamlHelper yaml(String value) {
        return new YamlHelper(LoadSettings.builder().build(), value);
    }

    @Test
    void oldDefaultList_isReplacedWithTheNewDefault() {
        YamlHelper settings =
                yaml(
                        "mcp:\n  fileUrlAllowedHosts: ['oaiusercontent.com', 'openai.com',"
                                + " 'chatgpt.com']\n");
        YamlHelper template = yaml(TEMPLATE);

        assertTrue(new ConfigInitializer().upgradeSupersededDefaults(settings, template));
        template.updateValuesFromYaml(settings, template);

        assertEquals(
                List.of(
                        "oaiusercontent.com",
                        "openai.com",
                        "chatgpt.com",
                        "oaisdmntpr*.blob.core.windows.net"),
                template.getValueByExactKeyPath("mcp", "fileUrlAllowedHosts"));
    }

    @Test
    void listTheAdminChanged_isKept() {
        YamlHelper settings = yaml("mcp:\n  fileUrlAllowedHosts: ['files.example.com']\n");
        YamlHelper template = yaml(TEMPLATE);

        assertFalse(new ConfigInitializer().upgradeSupersededDefaults(settings, template));
        template.updateValuesFromYaml(settings, template);

        assertEquals(
                List.of("files.example.com"),
                template.getValueByExactKeyPath("mcp", "fileUrlAllowedHosts"));
    }

    @Test
    void emptyListMeaningDisabled_isKept() {
        YamlHelper settings = yaml("mcp:\n  fileUrlAllowedHosts: []\n");

        assertFalse(new ConfigInitializer().upgradeSupersededDefaults(settings, yaml(TEMPLATE)));
    }
}
