package stirling.software.SPDF.utils.misc;

import stirling.software.SPDF.model.api.misc.HighContrastColorCombination;
import stirling.software.SPDF.model.api.misc.ReplaceAndInvert;

public class HighContrastColorReplaceDecider {

    // To decide the text and background colors for High contrast color option for replace-invert
    // color feature
    public static String[] getColors(
            ReplaceAndInvert replaceAndInvert,
            HighContrastColorCombination highContrastColorCombination) {

        if (highContrastColorCombination == HighContrastColorCombination.BLACK_TEXT_ON_WHITE) {
            return new String[] {"0", "16777215"};
        } else if (highContrastColorCombination
                == HighContrastColorCombination.GREEN_TEXT_ON_BLACK) {
            return new String[] {"65280", "0"};
        } else if (highContrastColorCombination
                == HighContrastColorCombination.WHITE_TEXT_ON_BLACK) {
            return new String[] {"16777215", "0"};
        } else if (highContrastColorCombination
                == HighContrastColorCombination.YELLOW_TEXT_ON_BLACK) {

            return new String[] {"16776960", "0"};
        }

        return null;
    }
}
