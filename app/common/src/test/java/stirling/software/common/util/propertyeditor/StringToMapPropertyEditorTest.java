package stirling.software.common.util.propertyeditor;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("StringToMapPropertyEditor Tests")
class StringToMapPropertyEditorTest {

    private StringToMapPropertyEditor editor;

    @BeforeEach
    void setUp() {
        editor = new StringToMapPropertyEditor();
    }

    @Nested
    @DisplayName("Valid JSON Input Tests")
    class ValidJsonInputTests {

        @Test
        @DisplayName("Set as text parses valid JSON to Map correctly")
        void testSetAsText_ValidJson() {
            // Arrange
            String json = "{\"key1\":\"value1\",\"key2\":\"value2\"}";

            // Act
            editor.setAsText(json);
            Object value = editor.getValue();

            // Assert
            assertNotNull(value, "Value should not be null");
            assertInstanceOf(Map.class, value, "Value should be an instance of Map");

            @SuppressWarnings("unchecked")
            Map<String, String> map = (Map<String, String>) value;
            assertEquals(2, map.size(), "Map should contain 2 entries");
            assertEquals("value1", map.get("key1"), "First entry should be key1=value1");
            assertEquals("value2", map.get("key2"), "Second entry should be key2=value2");
        }

        @Test
        @DisplayName("Set as text handles empty JSON as empty Map")
        void testSetAsText_EmptyJson() {
            // Arrange
            String json = "{}";

            // Act
            editor.setAsText(json);
            Object value = editor.getValue();

            // Assert
            assertNotNull(value, "Value should not be null");
            assertInstanceOf(Map.class, value, "Value should be an instance of Map");

            @SuppressWarnings("unchecked")
            Map<String, String> map = (Map<String, String>) value;
            assertTrue(map.isEmpty(), "Map should be empty for empty JSON");
        }

        @Test
        @DisplayName("Set as text handles JSON with whitespace correctly")
        void testSetAsText_WhitespaceJson() {
            // Arrange
            String json = "  {  \"key1\" : \"value1\"  }  ";

            // Act
            editor.setAsText(json);
            Object value = editor.getValue();

            // Assert
            assertNotNull(value, "Value should not be null");
            assertInstanceOf(Map.class, value, "Value should be an instance of Map");

            @SuppressWarnings("unchecked")
            Map<String, String> map = (Map<String, String>) value;
            assertEquals(1, map.size(), "Map should contain 1 entry");
            assertEquals("value1", map.get("key1"), "Entry should be key1=value1");
        }

        @Test
        @DisplayName("Set as text handles nested JSON as string values")
        void testSetAsText_NestedJson() {
            // Arrange
            String json =
                    "{\"key1\":\"value1\",\"key2\":\"{\\\"nestedKey\\\":\\\"nestedValue\\\"}\"}";

            // Act
            editor.setAsText(json);
            Object value = editor.getValue();

            // Assert
            assertNotNull(value, "Value should not be null");
            assertInstanceOf(Map.class, value, "Value should be an instance of Map");

            @SuppressWarnings("unchecked")
            Map<String, String> map = (Map<String, String>) value;
            assertEquals(2, map.size(), "Map should contain 2 entries");
            assertEquals("value1", map.get("key1"), "First entry should be key1=value1");
            assertEquals(
                    "{\"nestedKey\":\"nestedValue\"}",
                    map.get("key2"),
                    "Second entry should be the nested JSON as a string");
        }
    }

    @Nested
    @DisplayName("Invalid Input Tests")
    class InvalidInputTests {

        @Test
        @DisplayName("Set as text throws IllegalArgumentException for invalid JSON")
        void testSetAsText_InvalidJson() {
            // Arrange
            String json = "{invalid json}";

            // Act & Assert
            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> editor.setAsText(json),
                            "Should throw IllegalArgumentException for invalid JSON");

            assertEquals(
                    "Failed to convert java.lang.String to java.util.Map",
                    exception.getMessage(),
                    "Exception message should match expected error");
        }

        @Test
        @DisplayName("Set as text throws IllegalArgumentException for null input")
        void testSetAsText_Null() {
            // Act & Assert
            assertThrows(
                    IllegalArgumentException.class,
                    () -> editor.setAsText(null),
                    "Should throw IllegalArgumentException for null input");
        }
    }
}
