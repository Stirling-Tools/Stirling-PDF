package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

public class PropertyConfigsTest {

    @Test
    public void testGetBooleanValue_WithKeys() {
        // Define keys and default value
        List<String> keys = Arrays.asList("test.key1", "test.key2", "test.key3");
        boolean defaultValue = false;

        // Set property for one of the keys
        System.setProperty("test.key2", "true");

        // Call the method under test
        boolean result = PropertyConfigs.getBooleanValue(keys, defaultValue);

        // Verify the result
        assertEquals(true, result);
    }

    @Test
    public void testGetStringValue_WithKeys() {
        // Define keys and default value
        List<String> keys = Arrays.asList("test.key1", "test.key2", "test.key3");
        String defaultValue = "default";

        // Set property for one of the keys
        System.setProperty("test.key2", "value");

        // Call the method under test
        String result = PropertyConfigs.getStringValue(keys, defaultValue);

        // Verify the result
        assertEquals("value", result);
    }

    @Test
    public void testGetBooleanValue_WithKey() {
        // Define key and default value
        String key = "test.key";
        boolean defaultValue = true;

        // Call the method under test
        boolean result = PropertyConfigs.getBooleanValue(key, defaultValue);

        // Verify the result
        assertEquals(true, result);
    }

    @Test
    public void testGetStringValue_WithKey() {
        // Define key and default value
        String key = "test.key";
        String defaultValue = "default";

        // Call the method under test
        String result = PropertyConfigs.getStringValue(key, defaultValue);

        // Verify the result
        assertEquals("default", result);
    }
}
