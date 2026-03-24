package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class PropertyConfigsTest {

    private static final String TEST_KEY = "stirling.test.property.key";
    private static final String TEST_KEY_2 = "stirling.test.property.key2";

    @AfterEach
    void tearDown() {
        System.clearProperty(TEST_KEY);
        System.clearProperty(TEST_KEY_2);
    }

    @Test
    void testGetBooleanValue_singleKey_fromSystemProperty() {
        System.setProperty(TEST_KEY, "true");
        assertTrue(PropertyConfigs.getBooleanValue(TEST_KEY, false));
    }

    @Test
    void testGetBooleanValue_singleKey_defaultWhenMissing() {
        assertFalse(PropertyConfigs.getBooleanValue(TEST_KEY, false));
        assertTrue(PropertyConfigs.getBooleanValue(TEST_KEY, true));
    }

    @Test
    void testGetBooleanValue_singleKey_falseValue() {
        System.setProperty(TEST_KEY, "false");
        assertFalse(PropertyConfigs.getBooleanValue(TEST_KEY, true));
    }

    @Test
    void testGetStringValue_singleKey_fromSystemProperty() {
        System.setProperty(TEST_KEY, "hello");
        assertEquals("hello", PropertyConfigs.getStringValue(TEST_KEY, "default"));
    }

    @Test
    void testGetStringValue_singleKey_defaultWhenMissing() {
        assertEquals("default", PropertyConfigs.getStringValue(TEST_KEY, "default"));
    }

    @Test
    void testGetBooleanValue_listKeys_firstMatch() {
        System.setProperty(TEST_KEY_2, "true");
        assertTrue(PropertyConfigs.getBooleanValue(List.of(TEST_KEY, TEST_KEY_2), false));
    }

    @Test
    void testGetBooleanValue_listKeys_defaultWhenNoneMatch() {
        assertFalse(PropertyConfigs.getBooleanValue(List.of(TEST_KEY, TEST_KEY_2), false));
    }

    @Test
    void testGetStringValue_listKeys_firstMatch() {
        System.setProperty(TEST_KEY, "first");
        System.setProperty(TEST_KEY_2, "second");
        assertEquals(
                "first", PropertyConfigs.getStringValue(List.of(TEST_KEY, TEST_KEY_2), "default"));
    }

    @Test
    void testGetStringValue_listKeys_defaultWhenNoneMatch() {
        assertEquals(
                "default",
                PropertyConfigs.getStringValue(List.of(TEST_KEY, TEST_KEY_2), "default"));
    }

    @Test
    void testGetBooleanValue_nonBooleanString() {
        System.setProperty(TEST_KEY, "notaboolean");
        // Boolean.valueOf returns false for non-boolean strings
        assertFalse(PropertyConfigs.getBooleanValue(TEST_KEY, true));
    }
}
