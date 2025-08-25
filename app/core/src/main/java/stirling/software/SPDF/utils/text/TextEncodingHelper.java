package stirling.software.SPDF.utils.text;

import org.apache.pdfbox.pdmodel.font.PDFont;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

import java.util.regex.Pattern;

@Slf4j
@UtilityClass
public class TextEncodingHelper {

    private final Pattern PATTERN = Pattern.compile("^[A-Z]+$");
    private final Pattern REGEX = Pattern.compile("^[A-Z]{6}\\+.*");
    private final Pattern REGEXP = Pattern.compile("^[A-Z]{5}\\+.*");
    private final Pattern PATTERN1 = Pattern.compile("^[A-Z]{4}\\+.*");

    public boolean canEncodeCharacters(PDFont font, String text) {
        if (font == null || text == null) {
            return false;
        }

        if (text.isEmpty()) {
            return true;
        }

        try {
            byte[] encoded = font.encode(text);
            if (encoded.length > 0) {
                return true;
            }
        } catch (Exception e) {
        }

        return validateAsCodePointArray(font, text);
    }

    private boolean validateAsCodePointArray(PDFont font, String text) {
        if (text == null || text.isEmpty()) {
            return true;
        }

        int totalCodePoints = 0;
        int successfulCodePoints = 0;

        for (int i = 0; i < text.length(); ) {
            int codePoint = text.codePointAt(i);
            String charStr = new String(Character.toChars(codePoint));
            totalCodePoints++;

            try {
                byte[] charEncoded = font.encode(charStr);
                if (charEncoded.length > 0) {
                    try {
                        float charWidth = font.getStringWidth(charStr);
                        if (charWidth >= 0) {
                            successfulCodePoints++;
                        }
                    } catch (Exception e) {
                        try {
                            if (canDecodeCharacter(font, charStr)) {
                                successfulCodePoints++;
                            }
                        } catch (Exception e2) {
                        }
                    }
                } else {
                    try {
                        if (canDecodeCharacter(font, charStr)) {
                            successfulCodePoints++;
                        }
                    } catch (Exception e) {
                    }
                }
            } catch (Exception e) {
                try {
                    if (canDecodeCharacter(font, charStr)) {
                        successfulCodePoints++;
                    }
                } catch (Exception e2) {
                    if (isBasicCharacter(codePoint)) {
                        successfulCodePoints++;
                    }
                }
            }

            i += Character.charCount(codePoint);
        }

        if (totalCodePoints == 0) {
            return true;
        }

        double successRate = (double) successfulCodePoints / totalCodePoints;
        return successRate >= 0.1;
    }

    private boolean canDecodeCharacter(PDFont font, String charStr) {
        if (font == null || charStr == null || charStr.isEmpty()) {
            return false;
        }

        try {
            for (int code = 0; code <= 0xFFFF; code++) {
                try {
                    String decoded = font.toUnicode(code);
                    if (decoded != null && decoded.equals(charStr)) {
                        return true;
                    }
                } catch (Exception e) {
                }
            }
        } catch (Exception e) {
        }

        return false;
    }

    private boolean isBasicCharacter(int codePoint) {
        return (codePoint >= 32 && codePoint <= 126)
                || (codePoint >= 160 && codePoint <= 255)
                || Character.isWhitespace(codePoint)
                || Character.isLetterOrDigit(codePoint);
    }

    public boolean isTextSegmentRemovable(PDFont font, String text) {
        if (font == null || text == null) {
            return false;
        }

        if (text.isEmpty()) {
            return true;
        }

        if (isSimpleCharacter(text)) {
            try {
                font.encode(text);
                font.getStringWidth(text);
                return true;
            } catch (Exception e) {
                try {
                    return canHandleText(font, text);
                } catch (Exception e2) {
                    return false;
                }
            }
        }

        return isTextFullyRemovable(font, text);
    }

    private boolean canHandleText(PDFont font, String text) {
        if (font == null || text == null) {
            return false;
        }

        if (text.isEmpty()) {
            return true;
        }

        for (int i = 0; i < text.length(); ) {
            int codePoint = text.codePointAt(i);
            String charStr = new String(Character.toChars(codePoint));

            boolean canHandle = false;

            try {
                byte[] encoded = font.encode(charStr);
                if (encoded.length > 0) {
                    canHandle = true;
                }
            } catch (Exception e) {
            }

            if (!canHandle) {
                try {
                    if (canDecodeCharacter(font, charStr)) {
                        canHandle = true;
                    }
                } catch (Exception e) {
                }
            }

            if (!canHandle && isBasicCharacter(codePoint)) {
                canHandle = true;
            }

            if (!canHandle) {
                return false;
            }

            i += Character.charCount(codePoint);
        }

        return true;
    }

    public boolean isTextFullyRemovable(PDFont font, String text) {
        if (font == null || text == null) {
            return false;
        }

        if (text.isEmpty()) {
            return true;
        }

        try {
            if (!canEncodeCharacters(font, text)) {
                return false;
            }

            try {
                float width = font.getStringWidth(text);
                if (width < 0) {
                    return false;
                }
            } catch (Exception e) {
                try {
                    if (!canCalculateTextWidth(font, text)) {
                        return false;
                    }
                } catch (Exception e2) {
                    return false;
                }
            }

            try {
                if (font.getFontDescriptor() == null) {
                    try {
                        return canHandleWithoutDescriptor(font, text);
                    } catch (Exception e) {
                        return false;
                    }
                }
            } catch (Exception e) {
                try {
                    return canHandleWithoutDescriptor(font, text);
                } catch (Exception e2) {
                    return false;
                }
            }

            try {
                font.getFontDescriptor().getFontBoundingBox();
            } catch (Exception e) {
                try {
                    return canHandleWithoutBoundingBox(font, text);
                } catch (Exception e2) {
                    return false;
                }
            }

            return true;

        } catch (Exception e) {
            try {
                return canHandleText(font, text);
            } catch (Exception e2) {
                return false;
            }
        }
    }

    private boolean canCalculateTextWidth(PDFont font, String text) {
        if (font == null || text == null) {
            return false;
        }

        if (text.isEmpty()) {
            return true;
        }

        for (int i = 0; i < text.length(); ) {
            int codePoint = text.codePointAt(i);
            String charStr = new String(Character.toChars(codePoint));

            boolean hasWidth = false;
            try {
                float charWidth = font.getStringWidth(charStr);
                if (charWidth >= 0) {
                    hasWidth = true;
                }
            } catch (Exception e) {
                try {
                    float defaultWidth = getDefaultCharWidth(font);
                    if (defaultWidth > 0) {
                        hasWidth = true;
                    }
                } catch (Exception e2) {
                }
            }

            if (!hasWidth && isBasicCharacter(codePoint)) {
                hasWidth = true;
            }

            if (!hasWidth) {
                return false;
            }

            i += Character.charCount(codePoint);
        }

        return true;
    }

    private float getDefaultCharWidth(PDFont font) {
        String[] testChars = {" ", "a", "A", "0", ".", "e", "!", "i", "l", "I"};
        for (String testChar : testChars) {
            try {
                float width = font.getStringWidth(testChar);
                if (width > 0) {
                    return width;
                }
            } catch (Exception e) {
            }
        }
        return 500;
    }

    private boolean canHandleWithoutDescriptor(PDFont font, String text) {
        try {
            return canCalculateTextWidth(font, text);
        } catch (Exception e) {
            return canHandleText(font, text);
        }
    }

    private boolean canHandleWithoutBoundingBox(PDFont font, String text) {
        try {
            return canCalculateTextWidth(font, text);
        } catch (Exception e) {
            return canHandleText(font, text);
        }
    }

    private boolean isSimpleCharacter(String text) {
        if (text == null) {
            return false;
        }

        if (text.isEmpty()) {
            return true;
        }

        if (text.length() > 50) {
            return false;
        }

        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);

            if (Character.isLetterOrDigit(c) || Character.isWhitespace(c)) {
                continue;
            }

            if (c >= 32 && c <= 126) {
                continue;
            }

            if (c >= 160 && c <= 255) {
                continue;
            }

            if (Character.getType(c) == Character.OTHER_PUNCTUATION
                    || Character.getType(c) == Character.DASH_PUNCTUATION
                    || Character.getType(c) == Character.START_PUNCTUATION
                    || Character.getType(c) == Character.END_PUNCTUATION
                    || Character.getType(c) == Character.CONNECTOR_PUNCTUATION
                    || Character.getType(c) == Character.OTHER_SYMBOL
                    || Character.getType(c) == Character.MATH_SYMBOL
                    || Character.getType(c) == Character.CURRENCY_SYMBOL) {
                continue;
            }

            return false;
        }

        return true;
    }

    public boolean fontSupportsCharacter(PDFont font, String character) {
        if (font == null || character == null) {
            return false;
        }

        if (character.isEmpty()) {
            return true;
        }

        try {
            byte[] encoded = font.encode(character);
            if (encoded.length > 0) {
                try {
                    float width = font.getStringWidth(character);
                    if (width >= 0) {
                        return true;
                    }
                } catch (Exception e) {
                }
                return true;
            }
        } catch (Exception e) {
        }

        try {
            if (canDecodeCharacter(font, character)) {
                return true;
            }
        } catch (Exception e) {
        }

        for (int i = 0; i < character.length(); ) {
            int codePoint = character.codePointAt(i);
            if (isBasicCharacter(codePoint)) {
                i += Character.charCount(codePoint);
                continue;
            }
            return false;
        }

        return true;
    }

    public boolean isFontSubset(String fontName) {
        if (fontName == null) {
            return false;
        }

        if (REGEX.matcher(fontName).matches()) {
            return true;
        }

        if (REGEXP.matcher(fontName).matches()) {
            return true;
        }

        if (PATTERN1.matcher(fontName).matches()) {
            return true;
        }

        if (fontName.contains("+")) {
            String prefix = fontName.split("\\+")[0];
            if (PATTERN.matcher(prefix).matches() && prefix.length() >= 4) {
                return true;
            }
        }

        return false;
    }

    public boolean canCalculateBasicWidths(PDFont font) {
        if (font == null) {
            return false;
        }

        try {
            float spaceWidth = font.getStringWidth(" ");
            if (spaceWidth > 0) {
                return true;
            }
        } catch (Exception e) {
        }

        String[] testChars = {
            "a", "A", "0", ".", "e", "!", "i", "l", "I", "m", "M", "W", "w", "1", "|", "-", "_",
            "=", "+", "(", ")", "[", "]", "{", "}", "<", ">", "/", "\\", "?", ",", ";", ":", "\"",
            "'", "`", "~", "@", "#", "$", "%", "^", "&", "*"
        };
        int successCount = 0;

        for (String ch : testChars) {
            try {
                float width = font.getStringWidth(ch);
                if (width > 0) {
                    successCount++;
                    if (successCount >= 3) {
                        return true;
                    }
                }
            } catch (Exception e) {
            }
        }

        try {
            for (int code = 32; code <= 126; code++) {
                try {
                    String ch = String.valueOf((char) code);
                    float width = font.getStringWidth(ch);
                    if (width > 0) {
                        successCount++;
                        if (successCount >= 1) {
                            return true;
                        }
                    }
                } catch (Exception e) {
                }
            }
        } catch (Exception e) {
        }

        try {
            for (int code = 160; code <= 255; code++) {
                try {
                    String ch = String.valueOf((char) code);
                    float width = font.getStringWidth(ch);
                    if (width > 0) {
                        return true;
                    }
                } catch (Exception e) {
                }
            }
        } catch (Exception e) {
        }

        return false;
    }

}
