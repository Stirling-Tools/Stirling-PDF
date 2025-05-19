package stirling.software.SPDF.utils.propertyeditor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.api.security.RedactionArea;

class StringToArrayListPropertyEditorTest {

    private StringToArrayListPropertyEditor editor;

    @BeforeEach
    void setUp() {
        editor = new StringToArrayListPropertyEditor();
    }

    @Test
    void testSetAsText_ValidJson() {
        // Arrange
        String json =
                "[{\"x\":10.5,\"y\":20.5,\"width\":100.0,\"height\":50.0,\"page\":1,\"color\":\"#FF0000\"}]";

        // Act
        editor.setAsText(json);
        Object value = editor.getValue();

        // Assert
        assertNotNull(value, "Value should not be null");
        assertTrue(value instanceof List, "Value should be a List");

        @SuppressWarnings("unchecked")
        List<RedactionArea> list = (List<RedactionArea>) value;
        assertEquals(1, list.size(), "List should have 1 entry");

        RedactionArea area = list.get(0);
        assertEquals(10.5, area.getX(), "X should be 10.5");
        assertEquals(20.5, area.getY(), "Y should be 20.5");
        assertEquals(100.0, area.getWidth(), "Width should be 100.0");
        assertEquals(50.0, area.getHeight(), "Height should be 50.0");
        assertEquals(1, area.getPage(), "Page should be 1");
        assertEquals("#FF0000", area.getColor(), "Color should be #FF0000");
    }

    @Test
    void testSetAsText_MultipleItems() {
        // Arrange
        String json =
                "["
                        + "{\"x\":10.0,\"y\":20.0,\"width\":100.0,\"height\":50.0,\"page\":1,\"color\":\"#FF0000\"},"
                        + "{\"x\":30.0,\"y\":40.0,\"width\":200.0,\"height\":150.0,\"page\":2,\"color\":\"#00FF00\"}"
                        + "]";

        // Act
        editor.setAsText(json);
        Object value = editor.getValue();

        // Assert
        assertNotNull(value, "Value should not be null");
        assertTrue(value instanceof List, "Value should be a List");

        @SuppressWarnings("unchecked")
        List<RedactionArea> list = (List<RedactionArea>) value;
        assertEquals(2, list.size(), "List should have 2 entries");

        RedactionArea area1 = list.get(0);
        assertEquals(10.0, area1.getX(), "X should be 10.0");
        assertEquals(20.0, area1.getY(), "Y should be 20.0");
        assertEquals(1, area1.getPage(), "Page should be 1");

        RedactionArea area2 = list.get(1);
        assertEquals(30.0, area2.getX(), "X should be 30.0");
        assertEquals(40.0, area2.getY(), "Y should be 40.0");
        assertEquals(2, area2.getPage(), "Page should be 2");
    }

    @Test
    void testSetAsText_EmptyString() {
        // Arrange
        String json = "";

        // Act
        editor.setAsText(json);
        Object value = editor.getValue();

        // Assert
        assertNotNull(value, "Value should not be null");
        assertTrue(value instanceof List, "Value should be a List");

        @SuppressWarnings("unchecked")
        List<RedactionArea> list = (List<RedactionArea>) value;
        assertTrue(list.isEmpty(), "List should be empty");
    }

    @Test
    void testSetAsText_NullString() {
        // Act
        editor.setAsText(null);
        Object value = editor.getValue();

        // Assert
        assertNotNull(value, "Value should not be null");
        assertTrue(value instanceof List, "Value should be a List");

        @SuppressWarnings("unchecked")
        List<RedactionArea> list = (List<RedactionArea>) value;
        assertTrue(list.isEmpty(), "List should be empty");
    }

    @Test
    void testSetAsText_SingleItemAsArray() {
        // Arrange - note this is a single object, not an array
        String json =
                "{\"x\":10.0,\"y\":20.0,\"width\":100.0,\"height\":50.0,\"page\":1,\"color\":\"#FF0000\"}";

        // Act
        editor.setAsText(json);
        Object value = editor.getValue();

        // Assert
        assertNotNull(value, "Value should not be null");
        assertTrue(value instanceof List, "Value should be a List");

        @SuppressWarnings("unchecked")
        List<RedactionArea> list = (List<RedactionArea>) value;
        assertEquals(1, list.size(), "List should have 1 entry");

        RedactionArea area = list.get(0);
        assertEquals(10.0, area.getX(), "X should be 10.0");
        assertEquals(20.0, area.getY(), "Y should be 20.0");
    }

    @Test
    void testSetAsText_InvalidJson() {
        // Arrange
        String json = "invalid json";

        // Act & Assert
        assertThrows(IllegalArgumentException.class, () -> editor.setAsText(json));
    }

    @Test
    void testSetAsText_InvalidStructure() {
        // Arrange - this JSON doesn't match RedactionArea structure
        String json = "[{\"invalid\":\"structure\"}]";

        // Act & Assert
        assertThrows(IllegalArgumentException.class, () -> editor.setAsText(json));
    }
}
