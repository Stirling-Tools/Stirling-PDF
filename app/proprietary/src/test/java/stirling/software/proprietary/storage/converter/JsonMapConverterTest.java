package stirling.software.proprietary.storage.converter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.util.Map;

import org.junit.jupiter.api.Test;

class JsonMapConverterTest {

    private final JsonMapConverter converter = new JsonMapConverter();

    // -------------------------------------------------------------------------
    // convertToDatabaseColumn
    // -------------------------------------------------------------------------

    @Test
    void convertToDatabaseColumn_nullMap_returnsNull() {
        assertThat(converter.convertToDatabaseColumn(null)).isNull();
    }

    @Test
    void convertToDatabaseColumn_emptyMap_returnsNull() {
        assertThat(converter.convertToDatabaseColumn(Map.of())).isNull();
    }

    @Test
    void convertToDatabaseColumn_singleEntry_producesValidJson() {
        String json = converter.convertToDatabaseColumn(Map.of("key", "value"));
        assertThat(json).contains("\"key\"").contains("\"value\"");
    }

    @Test
    void convertToDatabaseColumn_mapWithMixedTypes_roundTrips() {
        Map<String, Object> input = Map.of("str", "hello", "num", 42);
        String json = converter.convertToDatabaseColumn(input);
        Map<String, Object> result = converter.convertToEntityAttribute(json);
        assertThat(result.get("str")).isEqualTo("hello");
        assertThat(result.get("num")).isEqualTo(42);
    }

    // -------------------------------------------------------------------------
    // convertToEntityAttribute — normal paths
    // -------------------------------------------------------------------------

    @Test
    void convertToEntityAttribute_nullInput_returnsEmptyMap() {
        assertThat(converter.convertToEntityAttribute(null)).isEmpty();
    }

    @Test
    void convertToEntityAttribute_blankInput_returnsEmptyMap() {
        assertThat(converter.convertToEntityAttribute("   ")).isEmpty();
    }

    @Test
    void convertToEntityAttribute_validJson_restoresMap() {
        Map<String, Object> result = converter.convertToEntityAttribute("{\"foo\":\"bar\"}");
        assertThat(result).containsEntry("foo", "bar");
    }

    @Test
    void convertToEntityAttribute_nestedObject_preservesStructure() {
        String json = "{\"outer\":{\"inner\":\"value\"}}";
        Map<String, Object> result = converter.convertToEntityAttribute(json);
        assertThat(result).containsKey("outer");
    }

    // -------------------------------------------------------------------------
    // convertToEntityAttribute — legacy double-encoded fallback
    // -------------------------------------------------------------------------

    @Test
    void convertToEntityAttribute_doubleEncodedJson_fallbackRecovery() {
        // A JSON string node whose text content is itself valid JSON
        String doubleEncoded = "\"{\\\"foo\\\":\\\"bar\\\"}\"";
        Map<String, Object> result = converter.convertToEntityAttribute(doubleEncoded);
        assertThat(result).containsEntry("foo", "bar");
    }

    // -------------------------------------------------------------------------
    // convertToEntityAttribute — malformed input
    // -------------------------------------------------------------------------

    @Test
    void convertToEntityAttribute_completelyMalformed_returnsEmptyMap() {
        Map<String, Object> result = converter.convertToEntityAttribute("not-json-at-all");
        assertThat(result).isEmpty();
    }

    @Test
    void convertToEntityAttribute_malformedJson_doesNotThrow() {
        assertThatCode(() -> converter.convertToEntityAttribute("{broken"))
                .doesNotThrowAnyException();
    }
}
