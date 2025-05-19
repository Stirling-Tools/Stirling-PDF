package stirling.software.SPDF.utils.propertyeditor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class StringToMapPropertyEditorTest {

    private StringToMapPropertyEditor editor;

    @BeforeEach
    void setUp() {
        editor = new StringToMapPropertyEditor();
    }

    @Test
    void testSetAsText_ValidJson() {
        // Arrange
        String json = "{\"key1\":\"value1\",\"key2\":\"value2\"}";

        // Act
        editor.setAsText(json);
        Object value = editor.getValue();

        // Assert
        assertNotNull(value, "Value should not be null");
        assertTrue(value instanceof Map, "Value should be a Map");

        @SuppressWarnings("unchecked")
        Map<String, String> map = (Map<String, String>) value;
        assertEquals(2, map.size(), "Map should have 2 entries");
        assertEquals("value1", map.get("key1"), "First entry should be key1=value1");
        assertEquals("value2", map.get("key2"), "Second entry should be key2=value2");
    }

    @Test
    void testSetAsText_EmptyJson() {
        // Arrange
        String json = "{}";

        // Act
        editor.setAsText(json);
        Object value = editor.getValue();

        // Assert
        assertNotNull(value, "Value should not be null");
        assertTrue(value instanceof Map, "Value should be a Map");

        @SuppressWarnings("unchecked")
        Map<String, String> map = (Map<String, String>) value;
        assertTrue(map.isEmpty(), "Map should be empty");
    }

    @Test
    void testSetAsText_WhitespaceJson() {
        // Arrange
        String json = "  {  \"key1\" : \"value1\"  }  ";

        // Act
        editor.setAsText(json);
        Object value = editor.getValue();

        // Assert
        assertNotNull(value, "Value should not be null");
        assertTrue(value instanceof Map, "Value should be a Map");

        @SuppressWarnings("unchecked")
        Map<String, String> map = (Map<String, String>) value;
        assertEquals(1, map.size(), "Map should have 1 entry");
        assertEquals("value1", map.get("key1"), "Entry should be key1=value1");
    }

    @Test
    void testSetAsText_NestedJson() {
        // Arrange
        String json = "{\"key1\":\"value1\",\"key2\":\"{\\\"nestedKey\\\":\\\"nestedValue\\\"}\"}";

        // Act
        editor.setAsText(json);
        Object value = editor.getValue();

        // Assert
        assertNotNull(value, "Value should not be null");
        assertTrue(value instanceof Map, "Value should be a Map");

        @SuppressWarnings("unchecked")
        Map<String, String> map = (Map<String, String>) value;
        assertEquals(2, map.size(), "Map should have 2 entries");
        assertEquals("value1", map.get("key1"), "First entry should be key1=value1");
        assertEquals(
                "{\"nestedKey\":\"nestedValue\"}",
                map.get("key2"),
                "Second entry should be the nested JSON as a string");
    }

    @Test
    void testSetAsText_InvalidJson() {
        // Arrange
        String json = "{invalid json}";

        // Act & Assert
        IllegalArgumentException exception =
                assertThrows(IllegalArgumentException.class, () -> editor.setAsText(json));

        assertEquals(
                "Failed to convert java.lang.String to java.util.Map",
                exception.getMessage(),
                "Exception message should match expected error");
    }

    @Test
    void testSetAsText_Null() {
        // Act & Assert
        assertThrows(IllegalArgumentException.class, () -> editor.setAsText(null));
    }
}
