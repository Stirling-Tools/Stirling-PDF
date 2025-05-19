package stirling.software.SPDF.utils.misc;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.api.misc.HighContrastColorCombination;
import stirling.software.SPDF.model.api.misc.ReplaceAndInvert;

class HighContrastColorReplaceDeciderTest {

    @Test
    void testGetColors_BlackTextOnWhite() {
        // Arrange
        ReplaceAndInvert replaceAndInvert = ReplaceAndInvert.HIGH_CONTRAST_COLOR;
        HighContrastColorCombination combination = HighContrastColorCombination.BLACK_TEXT_ON_WHITE;

        // Act
        String[] colors = HighContrastColorReplaceDecider.getColors(replaceAndInvert, combination);

        // Assert
        assertArrayEquals(
                new String[] {"0", "16777215"},
                colors,
                "Should return black (0) for text and white (16777215) for background");
    }

    @Test
    void testGetColors_GreenTextOnBlack() {
        // Arrange
        ReplaceAndInvert replaceAndInvert = ReplaceAndInvert.HIGH_CONTRAST_COLOR;
        HighContrastColorCombination combination = HighContrastColorCombination.GREEN_TEXT_ON_BLACK;

        // Act
        String[] colors = HighContrastColorReplaceDecider.getColors(replaceAndInvert, combination);

        // Assert
        assertArrayEquals(
                new String[] {"65280", "0"},
                colors,
                "Should return green (65280) for text and black (0) for background");
    }

    @Test
    void testGetColors_WhiteTextOnBlack() {
        // Arrange
        ReplaceAndInvert replaceAndInvert = ReplaceAndInvert.HIGH_CONTRAST_COLOR;
        HighContrastColorCombination combination = HighContrastColorCombination.WHITE_TEXT_ON_BLACK;

        // Act
        String[] colors = HighContrastColorReplaceDecider.getColors(replaceAndInvert, combination);

        // Assert
        assertArrayEquals(
                new String[] {"16777215", "0"},
                colors,
                "Should return white (16777215) for text and black (0) for background");
    }

    @Test
    void testGetColors_YellowTextOnBlack() {
        // Arrange
        ReplaceAndInvert replaceAndInvert = ReplaceAndInvert.HIGH_CONTRAST_COLOR;
        HighContrastColorCombination combination =
                HighContrastColorCombination.YELLOW_TEXT_ON_BLACK;

        // Act
        String[] colors = HighContrastColorReplaceDecider.getColors(replaceAndInvert, combination);

        // Assert
        assertArrayEquals(
                new String[] {"16776960", "0"},
                colors,
                "Should return yellow (16776960) for text and black (0) for background");
    }

    @Test
    void testGetColors_NullForInvalidCombination() {
        // Arrange - use null for combination
        ReplaceAndInvert replaceAndInvert = ReplaceAndInvert.HIGH_CONTRAST_COLOR;

        // Act
        String[] colors = HighContrastColorReplaceDecider.getColors(replaceAndInvert, null);

        // Assert
        assertNull(colors, "Should return null for invalid combination");
    }

    @Test
    void testGetColors_ReplaceAndInvertParameterIsIgnored() {
        // Arrange - use different ReplaceAndInvert values with the same combination
        HighContrastColorCombination combination = HighContrastColorCombination.BLACK_TEXT_ON_WHITE;

        // Act
        String[] colors1 =
                HighContrastColorReplaceDecider.getColors(
                        ReplaceAndInvert.HIGH_CONTRAST_COLOR, combination);
        String[] colors2 =
                HighContrastColorReplaceDecider.getColors(
                        ReplaceAndInvert.CUSTOM_COLOR, combination);
        String[] colors3 =
                HighContrastColorReplaceDecider.getColors(
                        ReplaceAndInvert.FULL_INVERSION, combination);

        // Assert - all should return the same colors, showing that the ReplaceAndInvert parameter
        // isn't used
        assertArrayEquals(colors1, colors2, "ReplaceAndInvert parameter should be ignored");
        assertArrayEquals(colors1, colors3, "ReplaceAndInvert parameter should be ignored");
    }
}
