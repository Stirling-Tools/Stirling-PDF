package stirling.software.common.util.misc;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.lang.reflect.Method;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.api.misc.HighContrastColorCombination;
import stirling.software.common.model.api.misc.ReplaceAndInvert;

@DisplayName("CustomColorReplaceStrategy Tests")
class CustomColorReplaceStrategyTest {

    private CustomColorReplaceStrategy strategy;
    private MultipartFile mockFile;

    @BeforeEach
    void setUp() {
        // Create a mock file
        mockFile =
                new MockMultipartFile(
                        "file", "test.pdf", "application/pdf", "test pdf content".getBytes());

        // Initialize strategy with custom colors
        strategy =
                new CustomColorReplaceStrategy(
                        mockFile,
                        ReplaceAndInvert.CUSTOM_COLOR,
                        "000000", // Black text color
                        "FFFFFF", // White background color
                        null); // Not using high contrast combination for CUSTOM_COLOR
    }

    @Nested
    @DisplayName("Constructor Tests")
    class ConstructorTests {

        @Test
        @DisplayName("Constructor initializes fields correctly")
        void testConstructor() {
            // Test the constructor sets values correctly
            assertNotNull(strategy, "Strategy instance should not be null");
            assertEquals(
                    mockFile,
                    strategy.getFileInput(),
                    "File input should match the provided value");
            assertEquals(
                    ReplaceAndInvert.CUSTOM_COLOR,
                    strategy.getReplaceAndInvert(),
                    "ReplaceAndInvert option should match the provided value");
        }
    }

    @Nested
    @DisplayName("Method Functionality Tests")
    class MethodFunctionalityTests {

        @Test
        @DisplayName("checkSupportedFontForCharacter returns non-null for supported characters")
        void testCheckSupportedFontForCharacter() throws Exception {
            // Use reflection to access private method
            Method method =
                    CustomColorReplaceStrategy.class.getDeclaredMethod(
                            "checkSupportedFontForCharacter", String.class);
            method.setAccessible(true);

            // Test with ASCII character which should be supported by standard fonts
            Object result = method.invoke(strategy, "A");
            assertNotNull(result, "Standard font should support ASCII character");
        }

        @Test
        @DisplayName("Replace method applies high contrast colors correctly")
        void testHighContrastColors() {
            // Create a new strategy with HIGH_CONTRAST_COLOR setting
            CustomColorReplaceStrategy highContrastStrategy =
                    new CustomColorReplaceStrategy(
                            mockFile,
                            ReplaceAndInvert.HIGH_CONTRAST_COLOR,
                            null, // These will be overridden by the high contrast settings
                            null,
                            HighContrastColorCombination.BLACK_TEXT_ON_WHITE);

            // Verify the colors after replace() is called
            try {
                // Call replace (but we don't need the actual result for this test)
                // This will throw IOException because we're using a mock file without actual PDF
                // content
                // but it will still set the colors according to the high contrast setting
                try {
                    highContrastStrategy.replace();
                } catch (IOException e) {
                    // Expected exception due to mock file
                }

                // Use reflection to access private fields
                java.lang.reflect.Field textColorField =
                        CustomColorReplaceStrategy.class.getDeclaredField("textColor");
                textColorField.setAccessible(true);
                java.lang.reflect.Field backgroundColorField =
                        CustomColorReplaceStrategy.class.getDeclaredField("backgroundColor");
                backgroundColorField.setAccessible(true);

                String textColor = (String) textColorField.get(highContrastStrategy);
                String backgroundColor = (String) backgroundColorField.get(highContrastStrategy);

                // For BLACK_TEXT_ON_WHITE, text color should be "0" and background color should be
                // "16777215"
                assertEquals("0", textColor, "Text color should be black (0)");
                assertEquals(
                        "16777215", backgroundColor, "Background color should be white (16777215)");

            } catch (Exception e) {
                // If we get here, the test failed
                fail("Exception occurred: " + e.getMessage());
            }
        }
    }
}
