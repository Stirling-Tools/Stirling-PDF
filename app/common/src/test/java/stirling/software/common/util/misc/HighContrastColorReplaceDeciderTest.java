package stirling.software.common.util.misc;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.NullSource;

import stirling.software.common.model.api.misc.HighContrastColorCombination;
import stirling.software.common.model.api.misc.ReplaceAndInvert;

@DisplayName("HighContrastColorReplaceDecider Tests")
class HighContrastColorReplaceDeciderTest {

    @Nested
    @DisplayName("Get Colors Tests for Valid Combinations")
    class ValidCombinationTests {

        @ParameterizedTest
        @EnumSource(HighContrastColorCombination.class)
        @DisplayName("Get colors returns correct values for each high contrast combination")
        void testGetColors_ForHighContrastCombinations(HighContrastColorCombination combination) {
            // Arrange
            ReplaceAndInvert replaceAndInvert = ReplaceAndInvert.HIGH_CONTRAST_COLOR;

            // Act
            String[] colors =
                    HighContrastColorReplaceDecider.getColors(replaceAndInvert, combination);

            // Assert based on combination
            switch (combination) {
                case BLACK_TEXT_ON_WHITE ->
                        assertArrayEquals(
                                new String[] {"0", "16777215"},
                                colors,
                                "Should return black (0) text on white (16777215) background");
                case GREEN_TEXT_ON_BLACK ->
                        assertArrayEquals(
                                new String[] {"65280", "0"},
                                colors,
                                "Should return green (65280) text on black (0) background");
                case WHITE_TEXT_ON_BLACK ->
                        assertArrayEquals(
                                new String[] {"16777215", "0"},
                                colors,
                                "Should return white (16777215) text on black (0) background");
                case YELLOW_TEXT_ON_BLACK ->
                        assertArrayEquals(
                                new String[] {"16776960", "0"},
                                colors,
                                "Should return yellow (16776960) text on black (0) background");
                default -> fail("Unexpected combination: " + combination);
            }
        }
    }

    @Nested
    @DisplayName("Edge Case Tests")
    class EdgeCaseTests {

        @Test
        @DisplayName("Get colors returns null for invalid (null) combination")
        void testGetColors_NullForInvalidCombination() {
            // Arrange
            ReplaceAndInvert replaceAndInvert = ReplaceAndInvert.HIGH_CONTRAST_COLOR;

            // Act
            String[] colors = HighContrastColorReplaceDecider.getColors(replaceAndInvert, null);

            // Assert
            assertNull(colors, "Should return null for invalid (null) combination");
        }

        @ParameterizedTest
        @EnumSource(ReplaceAndInvert.class)
        @NullSource
        @DisplayName("Get colors ignores ReplaceAndInvert parameter and uses combination")
        void testGetColors_ReplaceAndInvertParameterIsIgnored(ReplaceAndInvert replaceAndInvert) {
            // Arrange
            HighContrastColorCombination combination =
                    HighContrastColorCombination.BLACK_TEXT_ON_WHITE;

            // Act
            String[] colors =
                    HighContrastColorReplaceDecider.getColors(replaceAndInvert, combination);

            // Assert
            assertArrayEquals(
                    new String[] {"0", "16777215"},
                    colors,
                    "Should return consistent colors regardless of ReplaceAndInvert value");
        }
    }
}
