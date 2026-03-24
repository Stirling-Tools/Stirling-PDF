package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.snakeyaml.engine.v2.api.LoadSettings;

class YamlHelperTest {

    private static final String SIMPLE_YAML =
            "server:\n  port: 8080\n  host: localhost\napp:\n  name: test\n  debug: true\n";

    private static final LoadSettings LOAD_SETTINGS =
            LoadSettings.builder()
                    .setUseMarks(true)
                    .setMaxAliasesForCollections(Integer.MAX_VALUE)
                    .setAllowRecursiveKeys(true)
                    .setParseComments(true)
                    .build();

    private YamlHelper createHelper(String yaml) {
        return new YamlHelper(LOAD_SETTINGS, yaml);
    }

    @Test
    void testGetValueByExactKeyPath_scalarValue() {
        YamlHelper helper = createHelper(SIMPLE_YAML);
        Object value = helper.getValueByExactKeyPath("server", "port");
        assertEquals("8080", value);
    }

    @Test
    void testGetValueByExactKeyPath_stringValue() {
        YamlHelper helper = new YamlHelper(LOAD_SETTINGS, SIMPLE_YAML);
        Object value = helper.getValueByExactKeyPath("server", "host");
        assertEquals("localhost", value);
    }

    @Test
    void testGetValueByExactKeyPath_nonExistentKey() {
        YamlHelper helper = new YamlHelper(LOAD_SETTINGS, SIMPLE_YAML);
        Object value = helper.getValueByExactKeyPath("nonexistent", "key");
        assertNull(value);
    }

    @Test
    void testGetAllKeys() {
        YamlHelper helper = new YamlHelper(LOAD_SETTINGS, SIMPLE_YAML);
        Set<String> keys = helper.getAllKeys();
        assertTrue(keys.contains("server"));
        assertTrue(keys.contains("server.port"));
        assertTrue(keys.contains("server.host"));
        assertTrue(keys.contains("app"));
        assertTrue(keys.contains("app.name"));
        assertTrue(keys.contains("app.debug"));
    }

    @Test
    void testUpdateValue() {
        YamlHelper helper = new YamlHelper(LOAD_SETTINGS, SIMPLE_YAML);
        boolean updated = helper.updateValue(Arrays.asList("server", "port"), "9090");
        assertTrue(updated);
        Object newValue = helper.getValueByExactKeyPath("server", "port");
        assertEquals("9090", newValue);
    }

    @Test
    void testUpdateValue_nonExistentKey() {
        YamlHelper helper = new YamlHelper(LOAD_SETTINGS, SIMPLE_YAML);
        boolean updated = helper.updateValue(Arrays.asList("nonexistent", "key"), "value");
        assertFalse(updated);
    }

    @Test
    void testConvertNodeToYaml() {
        YamlHelper helper = new YamlHelper(LOAD_SETTINGS, SIMPLE_YAML);
        String yaml = helper.convertNodeToYaml(helper.getUpdatedRootNode());
        assertNotNull(yaml);
        assertTrue(yaml.contains("server"));
        assertTrue(yaml.contains("port"));
    }

    @Test
    void testConstructorFromFile(@TempDir Path tempDir) throws IOException {
        Path yamlFile = tempDir.resolve("test.yaml");
        Files.writeString(yamlFile, SIMPLE_YAML);

        YamlHelper helper = new YamlHelper(yamlFile);
        Object value = helper.getValueByExactKeyPath("app", "name");
        assertEquals("test", value);
    }

    @Test
    void testSequenceValues() {
        String yaml = "items:\n  - alpha\n  - beta\n  - gamma\n";
        YamlHelper helper = new YamlHelper(LOAD_SETTINGS, yaml);
        Object value = helper.getValueByExactKeyPath("items");
        assertInstanceOf(List.class, value);
        List<?> list = (List<?>) value;
        assertEquals(3, list.size());
        assertEquals("alpha", list.get(0));
    }

    // --- Static type check methods ---

    @Test
    void testIsInteger() {
        assertTrue(YamlHelper.isInteger(42));
        assertTrue(YamlHelper.isInteger("123"));
        assertFalse(YamlHelper.isInteger("abc"));
        assertFalse(YamlHelper.isInteger(3.14));
    }

    @Test
    void testIsFloat() {
        assertTrue(YamlHelper.isFloat(3.14f));
        assertTrue(YamlHelper.isFloat(3.14));
        assertTrue(YamlHelper.isFloat("3.14"));
        assertFalse(YamlHelper.isFloat("abc"));
    }

    @Test
    void testIsLong() {
        assertTrue(YamlHelper.isLong(42L));
        assertTrue(YamlHelper.isLong("9999999999"));
        assertFalse(YamlHelper.isLong("notALong"));
    }

    @Test
    void testIsAnyInteger() {
        assertTrue(YamlHelper.isAnyInteger(42));
        assertTrue(YamlHelper.isAnyInteger((short) 5));
        assertTrue(YamlHelper.isAnyInteger((byte) 1));
        assertTrue(YamlHelper.isAnyInteger(100L));
        assertFalse(YamlHelper.isAnyInteger("xyz"));
    }

    @Test
    void testSave_differentPath(@TempDir Path tempDir) throws IOException {
        Path originalFile = tempDir.resolve("original.yaml");
        Files.writeString(originalFile, SIMPLE_YAML);

        YamlHelper helper = new YamlHelper(originalFile);
        helper.updateValue(Arrays.asList("server", "port"), "9090");

        Path savePath = tempDir.resolve("saved.yaml");
        helper.save(savePath);

        assertTrue(Files.exists(savePath));
        String content = Files.readString(savePath);
        assertTrue(content.contains("9090"));
    }
}
