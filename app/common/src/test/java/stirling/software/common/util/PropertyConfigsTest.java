package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("PropertyConfigs Tests")
public class PropertyConfigsTest {

    private static final String TEST_KEY_1 = "test.key1";
    private static final String TEST_KEY_2 = "test.key2";
    private static final String TEST_KEY_3 = "test.key3";

    @BeforeEach
    void setUp() {
        // Clear any existing system properties for test keys to ensure isolation
        System.clearProperty(TEST_KEY_1);
        System.clearProperty(TEST_KEY_2);
        System.clearProperty(TEST_KEY_3);
    }

    @AfterEach
    void tearDown() {
        // Clean up system properties after each test
        System.clearProperty(TEST_KEY_1);
        System.clearProperty(TEST_KEY_2);
        System.clearProperty(TEST_KEY_3);
    }

    @Nested
    @DisplayName("Boolean Value Retrieval Tests")
    class BooleanValueRetrievalTests {

        @Test
        @DisplayName("Returns true when one of multiple keys has value 'true'")
        void testGetBooleanValue_WithKeys_ReturnsTrue() {
            // Arrange
            List<String> keys = Arrays.asList(TEST_KEY_1, TEST_KEY_2, TEST_KEY_3);
            boolean defaultValue = false;
            System.setProperty(TEST_KEY_2, "true");

            // Act
            boolean result = PropertyConfigs.getBooleanValue(keys, defaultValue);

            // Assert
            assertTrue(result, "Should return true when a key is set to 'true'");
        }

        @Test
        @DisplayName("Returns default value when none of multiple keys are set")
        void testGetBooleanValue_WithKeys_ReturnsDefault() {
            // Arrange
            List<String> keys = Arrays.asList(TEST_KEY_1, TEST_KEY_2, TEST_KEY_3);
            boolean defaultValue = false;

            // Act
            boolean result = PropertyConfigs.getBooleanValue(keys, defaultValue);

            // Assert
            assertFalse(result, "Should return default value when no keys are set");
        }

        @Test
        @DisplayName("Returns default value when key has invalid boolean value")
        void testGetBooleanValue_WithKeys_InvalidValue() {
            // Arrange
            List<String> keys = Arrays.asList(TEST_KEY_1, TEST_KEY_2, TEST_KEY_3);
            boolean defaultValue = false;
            System.setProperty(TEST_KEY_2, "invalid");

            // Act
            boolean result = PropertyConfigs.getBooleanValue(keys, defaultValue);

            // Assert
            assertFalse(result, "Should return default value when key has invalid boolean value");
        }

        @Test
        @DisplayName("Returns true when single key is set to 'true'")
        void testGetBooleanValue_WithKey_ReturnsTrue() {
            // Arrange
            String key = TEST_KEY_1;
            boolean defaultValue = false;
            System.setProperty(key, "true");

            // Act
            boolean result = PropertyConfigs.getBooleanValue(key, defaultValue);

            // Assert
            assertTrue(result, "Should return true when the key is set to 'true'");
        }

        @Test
        @DisplayName("Returns default value when single key is not set")
        void testGetBooleanValue_WithKey_ReturnsDefault() {
            // Arrange
            boolean defaultValue = true;

            // Act
            boolean result = PropertyConfigs.getBooleanValue(TEST_KEY_1, defaultValue);

            // Assert
            assertTrue(result, "Should return default value when key is not set");
        }
    }

    @Nested
    @DisplayName("String Value Retrieval Tests")
    class StringValueRetrievalTests {

        @Test
        @DisplayName("Returns value when one of multiple keys is set")
        void testGetStringValue_WithKeys_ReturnsValue() {
            // Arrange
            List<String> keys = Arrays.asList(TEST_KEY_1, TEST_KEY_2, TEST_KEY_3);
            String defaultValue = "default";
            String expectedValue = "value";
            System.setProperty(TEST_KEY_2, expectedValue);

            // Act
            String result = PropertyConfigs.getStringValue(keys, defaultValue);

            // Assert
            assertEquals(expectedValue, result, "Should return the value of the set key");
        }

        @Test
        @DisplayName("Returns default value when none of multiple keys are set")
        void testGetStringValue_WithKeys_ReturnsDefault() {
            // Arrange
            List<String> keys = Arrays.asList(TEST_KEY_1, TEST_KEY_2, TEST_KEY_3);
            String defaultValue = "default";

            // Act
            String result = PropertyConfigs.getStringValue(keys, defaultValue);

            // Assert
            assertEquals(defaultValue, result, "Should return default value when no keys are set");
        }

        @Test
        @DisplayName("Returns value when single key is set")
        void testGetStringValue_WithKey_ReturnsValue() {
            // Arrange
            String key = TEST_KEY_1;
            String defaultValue = "default";
            String expectedValue = "customValue";
            System.setProperty(key, expectedValue);

            // Act
            String result = PropertyConfigs.getStringValue(key, defaultValue);

            // Assert
            assertEquals(expectedValue, result, "Should return the value of the set key");
        }

        @Test
        @DisplayName("Returns default value when single key is not set")
        void testGetStringValue_WithKey_ReturnsDefault() {
            // Arrange
            String defaultValue = "default";

            // Act
            String result = PropertyConfigs.getStringValue(TEST_KEY_1, defaultValue);

            // Assert
            assertEquals(defaultValue, result, "Should return default value when key is not set");
        }
    }
}
