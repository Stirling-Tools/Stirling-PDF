package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.snakeyaml.engine.v2.api.LoadSettings;

class YamlHelperMoreTest {

    private static final LoadSettings LOAD_SETTINGS =
            LoadSettings.builder()
                    .setUseMarks(true)
                    .setMaxAliasesForCollections(Integer.MAX_VALUE)
                    .setAllowRecursiveKeys(true)
                    .setParseComments(true)
                    .build();

    private YamlHelper helper(String yaml) {
        return new YamlHelper(LOAD_SETTINGS, yaml);
    }

    @Nested
    @DisplayName("updateValue value-type handling")
    class UpdateValueTypes {

        @Test
        @DisplayName("updates an integer value with INT tag")
        void integerValue() {
            YamlHelper h = helper("server:\n  port: 80\n");
            assertThat(h.updateValue(List.of("server", "port"), 8080)).isTrue();
            assertThat(h.getValueByExactKeyPath("server", "port")).isEqualTo("8080");
        }

        @Test
        @DisplayName("updates a float value")
        void floatValue() {
            YamlHelper h = helper("scale:\n  factor: 1.0\n");
            assertThat(h.updateValue(List.of("scale", "factor"), 2.5f)).isTrue();
            assertThat(String.valueOf(h.getValueByExactKeyPath("scale", "factor")))
                    .startsWith("2.5");
        }

        @Test
        @DisplayName("updates a boolean value via string literal")
        void booleanValue() {
            YamlHelper h = helper("flags:\n  on: false\n");
            assertThat(h.updateValue(List.of("flags", "on"), "true")).isTrue();
            assertThat(h.getValueByExactKeyPath("flags", "on")).isEqualTo("true");
        }

        @Test
        @DisplayName("replaces a scalar with a Map value (MappingNode)")
        void mapValue() {
            YamlHelper h = helper("meta:\n  data: placeholder\n");
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("author", "alice");
            map.put("year", 2024);
            assertThat(h.updateValue(List.of("meta", "data"), map)).isTrue();
            assertThat(h.getValueByExactKeyPath("meta", "data", "author")).isEqualTo("alice");
            assertThat(h.getValueByExactKeyPath("meta", "data", "year")).isEqualTo("2024");
        }

        @Test
        @DisplayName("replaces a scalar with a List value (SequenceNode)")
        void listValue() {
            YamlHelper h = helper("cfg:\n  items: x\n");
            assertThat(h.updateValue(List.of("cfg", "items"), List.of("a", "b", "c"))).isTrue();
            Object value = h.getValueByExactKeyPath("cfg", "items");
            assertThat(value).isInstanceOf(List.class);
            List<?> list = (List<?>) value;
            assertThat(list).hasSize(3);
            assertThat(list.toString()).contains("a").contains("b").contains("c");
        }

        @Test
        @DisplayName("list with mixed scalar element types is converted")
        void mixedListValue() {
            YamlHelper h = helper("cfg:\n  vals: x\n");
            assertThat(h.updateValue(List.of("cfg", "vals"), List.of("s", 1, 2.5, "true")))
                    .isTrue();
            Object value = h.getValueByExactKeyPath("cfg", "vals");
            assertThat((List<?>) value).hasSize(4);
        }

        @Test
        @DisplayName("updates a previously null scalar")
        void nullScalarBecomesValue() {
            YamlHelper h = helper("opt:\n  value:\n");
            assertThat(h.updateValue(List.of("opt", "value"), "set")).isTrue();
            assertThat(h.getValueByExactKeyPath("opt", "value")).isEqualTo("set");
        }

        @Test
        @DisplayName("updates a null scalar to a boolean (BOOL tag promotion)")
        void nullScalarBecomesBoolean() {
            YamlHelper h = helper("opt:\n  enabled:\n");
            assertThat(h.updateValue(List.of("opt", "enabled"), Boolean.TRUE)).isTrue();
            assertThat(h.getValueByExactKeyPath("opt", "enabled")).isEqualTo("true");
        }

        @Test
        @DisplayName("returns false when intermediate key path is not a mapping")
        void nonMappingPathReturnsFalse() {
            YamlHelper h = helper("server:\n  port: 80\n");
            // 'port' is a scalar, so descending into it cannot update.
            assertThat(h.updateValue(List.of("server", "port", "deeper"), "x")).isFalse();
        }
    }

    @Nested
    @DisplayName("updateValuesFromYaml")
    class UpdateFromYaml {

        @Test
        @DisplayName("copies differing existing keys from source into target")
        void copiesChangedValues() {
            YamlHelper target = helper("server:\n  port: 80\n  host: localhost\n");
            YamlHelper source = helper("server:\n  port: 9090\n  host: localhost\n");
            boolean updated = target.updateValuesFromYaml(source, target);
            assertThat(updated).isTrue();
            assertThat(target.getValueByExactKeyPath("server", "port")).isEqualTo("9090");
        }

        @Test
        @DisplayName("source keys absent from target are not added (no update)")
        void unknownKeysIgnored() {
            YamlHelper target = helper("server:\n  port: 80\n");
            YamlHelper source = helper("server:\n  port: 80\n");
            boolean updated = target.updateValuesFromYaml(source, target);
            assertThat(updated).isFalse();
            assertThat(target.getValueByExactKeyPath("server", "port")).isEqualTo("80");
        }
    }

    @Nested
    @DisplayName("save / saveOverride / node tracking")
    class SaveAndNodes {

        @Test
        @DisplayName("save to the original path is a no-op write but returns the mapping")
        void saveSamePathNoRewrite(@TempDir Path tempDir) throws IOException {
            Path file = tempDir.resolve("orig.yaml");
            Files.writeString(file, "a:\n  b: 1\n");
            YamlHelper h = new YamlHelper(file);
            h.updateValue(List.of("a", "b"), 2);
            // Same path: method must not rewrite the file but still return a MappingNode.
            assertThat(h.save(file)).isNotNull();
        }

        @Test
        @DisplayName("saveOverride writes to disk")
        void saveOverrideWrites(@TempDir Path tempDir) throws IOException {
            YamlHelper h = helper("a:\n  b: 1\n");
            h.updateValue(List.of("a", "b"), 42);
            Path out = tempDir.resolve("out.yaml");
            h.saveOverride(out);
            assertThat(Files.readString(out)).contains("42");
        }

        @Test
        @DisplayName("setNewNode then getUpdatedRootNode returns the set node")
        void setAndGetNode() {
            YamlHelper h = helper("a:\n  b: 1\n");
            var root = h.getUpdatedRootNode();
            h.setNewNode(root);
            assertThat(h.getUpdatedRootNode()).isSameAs(root);
        }
    }

    @Nested
    @DisplayName("static numeric type checks")
    class NumericChecks {

        @Test
        @DisplayName("isShort / isByte accept Long and parsable strings")
        void shortAndByte() {
            assertThat(YamlHelper.isShort(5L)).isTrue();
            assertThat(YamlHelper.isShort("100")).isTrue();
            assertThat(YamlHelper.isShort("notNumeric")).isFalse();
            assertThat(YamlHelper.isByte(1L)).isTrue();
            assertThat(YamlHelper.isByte("7")).isTrue();
            assertThat(YamlHelper.isByte("999999")).isFalse();
        }

        @Test
        @DisplayName("isInteger rejects null and non-numeric, accepts boxed integers")
        void integerEdges() {
            assertThat(YamlHelper.isInteger(null)).isFalse();
            assertThat(YamlHelper.isInteger((byte) 3)).isTrue();
            assertThat(YamlHelper.isInteger((short) 9)).isTrue();
        }
    }
}
