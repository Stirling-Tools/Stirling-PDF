package stirling.software.SPDF.controller.api.form;

import static org.assertj.core.api.Assertions.*;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.util.FormUtils;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@DisplayName("FormPayloadParser Tests")
class FormPayloadParserTest {

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = JsonMapper.builder().build();
    }

    // ── parseValueMap ──────────────────────────────────────────────────

    @Nested
    @DisplayName("parseValueMap")
    class ParseValueMap {

        @Test
        @DisplayName("returns empty map for null input")
        void nullInput() {
            Map<String, Object> result = FormPayloadParser.parseValueMap(objectMapper, null);
            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("returns empty map for blank input")
        void blankInput() {
            Map<String, Object> result = FormPayloadParser.parseValueMap(objectMapper, "   ");
            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("parses flat JSON object as value map")
        void flatObject() {
            String json = "{\"field1\":\"value1\",\"field2\":\"value2\"}";
            Map<String, Object> result = FormPayloadParser.parseValueMap(objectMapper, json);
            assertThat(result).containsEntry("field1", "value1").containsEntry("field2", "value2");
        }

        @Test
        @DisplayName("parses template wrapper object")
        void templateWrapper() {
            String json = "{\"template\":{\"name\":\"John\",\"age\":\"30\"}}";
            Map<String, Object> result = FormPayloadParser.parseValueMap(objectMapper, json);
            assertThat(result).containsEntry("name", "John").containsEntry("age", "30");
        }

        @Test
        @DisplayName("parses fields array with name/value pairs")
        void fieldsArray() {
            String json =
                    "{\"fields\":[{\"name\":\"f1\",\"value\":\"v1\"},{\"name\":\"f2\",\"value\":\"v2\"}]}";
            Map<String, Object> result = FormPayloadParser.parseValueMap(objectMapper, json);
            assertThat(result).containsEntry("f1", "v1").containsEntry("f2", "v2");
        }

        @Test
        @DisplayName("fields array falls back to defaultValue when value is null")
        void fieldsArrayDefaultValue() {
            String json = "{\"fields\":[{\"name\":\"f1\",\"defaultValue\":\"def\"}]}";
            Map<String, Object> result = FormPayloadParser.parseValueMap(objectMapper, json);
            assertThat(result).containsEntry("f1", "def");
        }

        @Test
        @DisplayName("parses top-level array with field objects")
        void topLevelArray() {
            String json = "[{\"name\":\"f1\",\"value\":\"v1\"}]";
            Map<String, Object> result = FormPayloadParser.parseValueMap(objectMapper, json);
            assertThat(result).containsEntry("f1", "v1");
        }

        @Test
        @DisplayName("top-level array with plain object uses first element as map")
        void topLevelArrayPlainObject() {
            String json = "[{\"key1\":\"val1\",\"key2\":\"val2\"}]";
            Map<String, Object> result = FormPayloadParser.parseValueMap(objectMapper, json);
            assertThat(result).containsEntry("key1", "val1").containsEntry("key2", "val2");
        }

        @Test
        @DisplayName("returns empty map for empty array")
        void emptyArray() {
            Map<String, Object> result = FormPayloadParser.parseValueMap(objectMapper, "[]");
            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("handles null values in flat object")
        void nullValuesInObject() {
            String json = "{\"f1\":null,\"f2\":\"v2\"}";
            Map<String, Object> result = FormPayloadParser.parseValueMap(objectMapper, json);
            assertThat(result).containsEntry("f1", null).containsEntry("f2", "v2");
        }

        @Test
        @DisplayName("handles boolean and numeric values")
        void booleanAndNumericValues() {
            String json = "{\"flag\":true,\"count\":42}";
            Map<String, Object> result = FormPayloadParser.parseValueMap(objectMapper, json);
            assertThat(result).containsEntry("flag", "true").containsEntry("count", "42");
        }

        @Test
        @DisplayName("handles array value in field definitions (joins with comma)")
        void arrayValueInFieldDef() {
            String json = "[{\"name\":\"multi\",\"value\":[\"a\",\"b\",\"c\"]}]";
            Map<String, Object> result = FormPayloadParser.parseValueMap(objectMapper, json);
            assertThat(result).containsEntry("multi", "a,b,c");
        }

        @Test
        @DisplayName("returns empty map for JSON null literal")
        void jsonNullLiteral() {
            Map<String, Object> result = FormPayloadParser.parseValueMap(objectMapper, "null");
            assertThat(result).isEmpty();
        }
    }

    // ── parseModificationDefinitions ───────────────────────────────────

    @Nested
    @DisplayName("parseModificationDefinitions")
    class ParseModificationDefinitions {

        @Test
        @DisplayName("returns empty list for null input")
        void nullInput() {
            List<FormUtils.ModifyFormFieldDefinition> result =
                    FormPayloadParser.parseModificationDefinitions(objectMapper, null);
            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("returns empty list for blank input")
        void blankInput() {
            List<FormUtils.ModifyFormFieldDefinition> result =
                    FormPayloadParser.parseModificationDefinitions(objectMapper, "  ");
            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("parses valid modification list")
        void validModifications() {
            String json =
                    "[{\"targetName\":\"field1\",\"name\":\"newName\",\"label\":null,\"type\":null,"
                            + "\"required\":null,\"multiSelect\":null,\"options\":null,\"defaultValue\":\"newVal\",\"tooltip\":null}]";
            List<FormUtils.ModifyFormFieldDefinition> result =
                    FormPayloadParser.parseModificationDefinitions(objectMapper, json);
            assertThat(result).hasSize(1);
            assertThat(result.get(0).targetName()).isEqualTo("field1");
            assertThat(result.get(0).name()).isEqualTo("newName");
            assertThat(result.get(0).defaultValue()).isEqualTo("newVal");
        }
    }

    // ── parseNameList ──────────────────────────────────────────────────

    @Nested
    @DisplayName("parseNameList")
    class ParseNameList {

        @Test
        @DisplayName("returns empty list for null input")
        void nullInput() {
            List<String> result = FormPayloadParser.parseNameList(objectMapper, null);
            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("returns empty list for blank input")
        void blankInput() {
            List<String> result = FormPayloadParser.parseNameList(objectMapper, "  ");
            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("parses array of strings")
        void arrayOfStrings() {
            List<String> result =
                    FormPayloadParser.parseNameList(objectMapper, "[\"field1\",\"field2\"]");
            assertThat(result).containsExactly("field1", "field2");
        }

        @Test
        @DisplayName("parses array of objects with name property")
        void arrayOfObjectsWithName() {
            String json = "[{\"name\":\"f1\"},{\"name\":\"f2\"}]";
            List<String> result = FormPayloadParser.parseNameList(objectMapper, json);
            assertThat(result).containsExactly("f1", "f2");
        }

        @Test
        @DisplayName("parses array of objects with targetName property")
        void arrayOfObjectsWithTargetName() {
            String json = "[{\"targetName\":\"f1\"}]";
            List<String> result = FormPayloadParser.parseNameList(objectMapper, json);
            assertThat(result).containsExactly("f1");
        }

        @Test
        @DisplayName("parses array of objects with fieldName property")
        void arrayOfObjectsWithFieldName() {
            String json = "[{\"fieldName\":\"f1\"}]";
            List<String> result = FormPayloadParser.parseNameList(objectMapper, json);
            assertThat(result).containsExactly("f1");
        }

        @Test
        @DisplayName("parses object with fields array")
        void objectWithFieldsArray() {
            String json = "{\"fields\":[{\"name\":\"f1\"},{\"name\":\"f2\"}]}";
            List<String> result = FormPayloadParser.parseNameList(objectMapper, json);
            assertThat(result).containsExactly("f1", "f2");
        }

        @Test
        @DisplayName("parses single object with name")
        void singleObjectWithName() {
            String json = "{\"name\":\"singleField\"}";
            List<String> result = FormPayloadParser.parseNameList(objectMapper, json);
            assertThat(result).containsExactly("singleField");
        }

        @Test
        @DisplayName("deduplicates names preserving order")
        void deduplication() {
            String json = "[{\"name\":\"f1\"},{\"name\":\"f2\"},{\"name\":\"f1\"}]";
            List<String> result = FormPayloadParser.parseNameList(objectMapper, json);
            assertThat(result).containsExactly("f1", "f2");
        }

        @Test
        @DisplayName("supports nested field object")
        void nestedFieldObject() {
            String json = "[{\"field\":{\"name\":\"nested1\"}}]";
            List<String> result = FormPayloadParser.parseNameList(objectMapper, json);
            assertThat(result).containsExactly("nested1");
        }

        @Test
        @DisplayName("returns empty for JSON null")
        void jsonNull() {
            List<String> result = FormPayloadParser.parseNameList(objectMapper, "null");
            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("throws for invalid JSON that cannot be parsed")
        void invalidJson() {
            assertThatThrownBy(
                            () ->
                                    FormPayloadParser.parseNameList(
                                            objectMapper, "{not valid json!!!}"))
                    .isInstanceOf(Exception.class);
        }
    }
}
