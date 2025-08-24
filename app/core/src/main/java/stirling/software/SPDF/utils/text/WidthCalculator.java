package stirling.software.SPDF.utils.text;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDSimpleFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;

import lombok.experimental.UtilityClass;

@UtilityClass
public class WidthCalculator {

    private final float CONSERVATIVE_CHAR_WIDTH_RATIO = 0.55f;
    private final float BBOX_CHAR_WIDTH_RATIO = 0.65f;

    public float calculateAccurateWidth(PDFont font, String text, float fontSize) {
        if (font == null || text == null || fontSize <= 0) {
            return 0;
        }

        if (text.isEmpty()) {
            return 0;
        }

        String normalizedText = normalizeText(text);

        Float directWidth = calculateDirectWidth(font, normalizedText, fontSize);
        if (directWidth != null) {
            return directWidth;
        }

        Float charByCharWidth = calculateCharacterByCharacterWidth(font, normalizedText, fontSize);
        if (charByCharWidth != null) {
            return charByCharWidth;
        }

        Float glyphWidth = calculateGlyphBasedWidth(font, normalizedText, fontSize);
        if (glyphWidth != null) {
            return glyphWidth;
        }

        return calculateComprehensiveFallbackWidth(font, normalizedText, fontSize);
    }

    private String normalizeText(String text) {
        if (text == null) return "";
        try {
            return Normalizer.normalize(text, Normalizer.Form.NFC);
        } catch (Exception e) {
            return text;
        }
    }

    private Float calculateDirectWidth(PDFont font, String text, float fontSize) {
        try {
            if (!TextEncodingHelper.canEncodeCharacters(font, text)) {
                return null;
            }
            float rawWidth = font.getStringWidth(text) / 1000f;
            if (rawWidth < 0) return null;
            float scaledWidth = rawWidth * fontSize;
            return scaledWidth >= 0 ? scaledWidth : null;
        } catch (Exception e) {
            return null;
        }
    }

    private Float calculateCharacterByCharacterWidth(PDFont font, String text, float fontSize) {
        try {
            List<Integer> codePoints = getCodePoints(text);
            float totalWidth = 0;
            int previousCodePoint = -1;

            for (int codePoint : codePoints) {
                String character = new String(Character.toChars(codePoint));
                Float charWidth =
                        calculateSingleCharacterWidth(font, character, fontSize, codePoint);

                if (charWidth == null) {
                    return null;
                }

                totalWidth += charWidth;
                if (previousCodePoint != -1) {
                    totalWidth += calculateKerning(font, previousCodePoint, codePoint, fontSize);
                }
                previousCodePoint = codePoint;
            }
            return totalWidth >= 0 ? totalWidth : null;
        } catch (Exception e) {
            return null;
        }
    }

    private List<Integer> getCodePoints(String text) {
        List<Integer> codePoints = new ArrayList<>();
        if (text == null) return codePoints;

        for (int i = 0; i < text.length(); ) {
            try {
                int codePoint = text.codePointAt(i);
                codePoints.add(codePoint);
                i += Character.charCount(codePoint);
            } catch (Exception e) {
                i++;
            }
        }
        return codePoints;
    }

    private Float calculateSingleCharacterWidth(
            PDFont font, String character, float fontSize, int codePoint) {
        try {
            if (TextEncodingHelper.fontSupportsCharacter(font, character)) {
                try {
                    float raw = font.getStringWidth(character) / 1000f;
                    if (raw >= 0) return raw * fontSize;
                } catch (Exception ignored) {
                }
            }
        } catch (Exception e) {
        }

        try {
            float w = font.getWidth(codePoint) / 1000f;
            if (w >= 0) return w * fontSize;
        } catch (Exception ignored) {
        }

        try {
            if (codePoint >= 0 && codePoint <= 0xFFFF) {
                float w = font.getWidth(codePoint) / 1000f;
                if (w >= 0) return w * fontSize;
            }
        } catch (Exception ignored) {
        }

        try {
            byte[] encoded = font.encode(character);
            if (encoded.length > 0) {
                for (byte b : encoded) {
                    try {
                        int glyphCode = b & 0xFF;
                        float w = font.getWidth(glyphCode) / 1000f;
                        if (w >= 0) return w * fontSize;
                    } catch (Exception ignored) {
                    }
                }
            }
        } catch (Exception ignored) {
        }

        return calculateCategoryBasedWidth(font, codePoint, fontSize);
    }

    private float calculateKerning(
            PDFont font, int leftCodePoint, int rightCodePoint, float fontSize) {
        try {
            if (font instanceof PDSimpleFont) {
                PDSimpleFont simpleFont = (PDSimpleFont) font;
                try {
                    java.lang.reflect.Method getKerningMethod =
                            simpleFont.getClass().getMethod("getKerning", int.class, int.class);
                    float kerningValue =
                            (Float)
                                    getKerningMethod.invoke(
                                            simpleFont, leftCodePoint, rightCodePoint);
                    return (kerningValue / 1000f) * fontSize;
                } catch (Exception e) {
                }
            }
        } catch (Exception e) {
        }

        try {
            String leftChar = new String(Character.toChars(leftCodePoint));
            String rightChar = new String(Character.toChars(rightCodePoint));
            String combined = leftChar + rightChar;

            float combinedWidth = font.getStringWidth(combined) / 1000f;
            float leftWidth = font.getStringWidth(leftChar) / 1000f;
            float rightWidth = font.getStringWidth(rightChar) / 1000f;

            float kerning = combinedWidth - leftWidth - rightWidth;
            return kerning * fontSize;
        } catch (Exception e) {
        }

        return 0f;
    }

    private Float calculateGlyphBasedWidth(PDFont font, String text, float fontSize) {
        try {
            float totalWidth = 0;

            for (int i = 0; i < text.length(); ) {
                int codePoint = text.codePointAt(i);
                String character = new String(Character.toChars(codePoint));

                Float charWidth =
                        calculateGlyphWidthComprehensively(font, character, codePoint, fontSize);
                if (charWidth == null) {
                    return null;
                }

                totalWidth += charWidth;
                i += Character.charCount(codePoint);
            }

            return totalWidth >= 0 ? totalWidth : null;

        } catch (Exception e) {
            return null;
        }
    }

    private Float calculateGlyphWidthComprehensively(
            PDFont font, String character, int codePoint, float fontSize) {
        try {
            byte[] encoded = font.encode(character);
            if (encoded.length > 0) {
                Float width = calculateWidthFromEncodedBytes(font, encoded, fontSize);
                if (width != null && width >= 0) {
                    return width;
                }
            }
        } catch (Exception e) {
        }

        try {
            float glyphWidth = font.getWidth(codePoint) / 1000f;
            if (glyphWidth >= 0) {
                return glyphWidth * fontSize;
            }
        } catch (Exception e) {
        }

        try {
            if (codePoint <= 0xFFFF) {
                float glyphWidth = font.getWidth(codePoint) / 1000f;
                if (glyphWidth >= 0) {
                    return glyphWidth * fontSize;
                }
            }
        } catch (Exception e) {
        }

        try {
            for (int code = 0; code <= 0xFF; code++) {
                try {
                    String decoded = font.toUnicode(code);
                    if (decoded != null && decoded.equals(character)) {
                        float glyphWidth = font.getWidth(code) / 1000f;
                        if (glyphWidth >= 0) {
                            return glyphWidth * fontSize;
                        }
                    }
                } catch (Exception e) {
                }
            }
        } catch (Exception e) {
        }

        return calculateCategoryBasedWidth(font, codePoint, fontSize);
    }

    private Float calculateWidthFromEncodedBytes(PDFont font, byte[] encoded, float fontSize) {
        if (encoded == null || encoded.length == 0) return null;

        if (font instanceof PDType0Font && encoded.length >= 2) {
            try {
                int glyphCode = ((encoded[0] & 0xFF) << 8) | (encoded[1] & 0xFF);
                float width = font.getWidth(glyphCode) / 1000f;
                if (width >= 0) {
                    return width * fontSize;
                }
            } catch (Exception e) {
            }

            try {
                for (int i = 0; i <= encoded.length - 2; i++) {
                    int glyphCode = ((encoded[i] & 0xFF) << 8) | (encoded[i + 1] & 0xFF);
                    float width = font.getWidth(glyphCode) / 1000f;
                    if (width >= 0) {
                        return width * fontSize;
                    }
                }
            } catch (Exception e) {
            }
        }

        for (byte b : encoded) {
            try {
                int glyphCode = b & 0xFF;
                float width = font.getWidth(glyphCode) / 1000f;
                if (width >= 0) {
                    return width * fontSize;
                }
            } catch (Exception e) {
            }
        }

        try {
            if (encoded.length >= 3) {
                int glyphCode =
                        ((encoded[0] & 0xFF) << 16)
                                | ((encoded[1] & 0xFF) << 8)
                                | (encoded[2] & 0xFF);
                float width = font.getWidth(glyphCode) / 1000f;
                if (width >= 0) {
                    return width * fontSize;
                }
            }
        } catch (Exception e) {
        }

        try {
            if (encoded.length >= 4) {
                int glyphCode =
                        ((encoded[0] & 0xFF) << 24)
                                | ((encoded[1] & 0xFF) << 16)
                                | ((encoded[2] & 0xFF) << 8)
                                | (encoded[3] & 0xFF);
                float width = font.getWidth(glyphCode) / 1000f;
                if (width >= 0) {
                    return width * fontSize;
                }
            }
        } catch (Exception e) {
        }

        return null;
    }

    private Float calculateCategoryBasedWidth(PDFont font, int codePoint, float fontSize) {
        try {
            int category = Character.getType(codePoint);
            float baseWidth = calculateAverageCharacterWidth(font, fontSize);

            float multiplier =
                    switch (category) {
                        case Character.UPPERCASE_LETTER -> 1.2f;
                        case Character.LOWERCASE_LETTER -> 1.0f;
                        case Character.TITLECASE_LETTER -> 1.15f;
                        case Character.MODIFIER_LETTER -> 0.7f;
                        case Character.OTHER_LETTER -> 1.0f;
                        case Character.DECIMAL_DIGIT_NUMBER -> 1.0f;
                        case Character.LETTER_NUMBER -> 1.0f;
                        case Character.OTHER_NUMBER -> 1.0f;
                        case Character.SPACE_SEPARATOR -> 0.5f;
                        case Character.LINE_SEPARATOR -> 0.0f;
                        case Character.PARAGRAPH_SEPARATOR -> 0.0f;
                        case Character.NON_SPACING_MARK -> 0.0f;
                        case Character.ENCLOSING_MARK -> 0.0f;
                        case Character.COMBINING_SPACING_MARK -> 0.3f;
                        case Character.DASH_PUNCTUATION -> 0.8f;
                        case Character.START_PUNCTUATION -> 0.6f;
                        case Character.END_PUNCTUATION -> 0.6f;
                        case Character.CONNECTOR_PUNCTUATION -> 0.6f;
                        case Character.OTHER_PUNCTUATION -> 0.6f;
                        case Character.MATH_SYMBOL -> 1.0f;
                        case Character.CURRENCY_SYMBOL -> 1.1f;
                        case Character.MODIFIER_SYMBOL -> 0.8f;
                        case Character.OTHER_SYMBOL -> 1.0f;
                        case Character.INITIAL_QUOTE_PUNCTUATION -> 0.6f;
                        case Character.FINAL_QUOTE_PUNCTUATION -> 0.6f;
                        case Character.CONTROL -> 0.0f;
                        case Character.FORMAT -> 0.0f;
                        case Character.PRIVATE_USE -> 1.0f;
                        case Character.SURROGATE -> 0.0f;
                        case Character.UNASSIGNED -> 1.0f;
                        default -> 1.0f;
                    };

            float result = baseWidth * multiplier;
            return result >= 0 ? result : baseWidth;
        } catch (Exception e) {
            return calculateAverageCharacterWidth(font, fontSize);
        }
    }

    private float calculateAverageCharacterWidth(PDFont font, float fontSize) {
        try {
            float avgWidth = font.getAverageFontWidth() / 1000f;
            if (avgWidth > 0) {
                return avgWidth * fontSize;
            }
        } catch (Exception e) {
        }

        try {
            String[] testChars = {
                "a", "A", "e", "E", "i", "I", "o", "O", "n", "N", "t", "T", "r", "R", "s", "S", "0",
                "1", "2", "3", "4", "5"
            };
            float totalWidth = 0;
            int successCount = 0;

            for (String testChar : testChars) {
                try {
                    float width = font.getStringWidth(testChar) / 1000f;
                    if (width > 0) {
                        totalWidth += width;
                        successCount++;
                    }
                } catch (Exception e) {
                }
            }

            if (successCount > 0) {
                return (totalWidth / successCount) * fontSize;
            }
        } catch (Exception e) {
        }

        try {
            for (int code = 32; code <= 126; code++) {
                try {
                    float width = font.getWidth(code) / 1000f;
                    if (width > 0) {
                        return width * fontSize;
                    }
                } catch (Exception e) {
                }
            }
        } catch (Exception e) {
        }

        try {
            if (font.getFontDescriptor() != null) {
                PDRectangle bbox = font.getFontDescriptor().getFontBoundingBox();
                if (bbox != null) {
                    float avgCharWidth = bbox.getWidth() / 2000f;
                    return avgCharWidth * fontSize;
                }
            }
        } catch (Exception e) {
        }

        return CONSERVATIVE_CHAR_WIDTH_RATIO * fontSize;
    }

    private float calculateComprehensiveFallbackWidth(PDFont font, String text, float fontSize) {
        if (text == null || text.isEmpty()) {
            return 0;
        }

        try {
            float charWidth = calculateAverageCharacterWidth(font, fontSize);
            float totalWidth = 0;

            for (int i = 0; i < text.length(); ) {
                int codePoint = text.codePointAt(i);
                Float specificWidth = calculateCategoryBasedWidth(font, codePoint, fontSize);
                if (specificWidth != null) {
                    totalWidth += specificWidth;
                } else {
                    totalWidth += charWidth;
                }
                i += Character.charCount(codePoint);
            }

            return totalWidth;
        } catch (Exception e) {
        }

        try {
            if (font.getFontDescriptor() != null
                    && font.getFontDescriptor().getFontBoundingBox() != null) {
                PDRectangle bbox = font.getFontDescriptor().getFontBoundingBox();
                float avgCharWidth = bbox.getWidth() / 1000f;
                return text.length() * avgCharWidth * BBOX_CHAR_WIDTH_RATIO * fontSize;
            }
        } catch (Exception e) {
        }

        return text.length() * calculateAverageCharacterWidth(font, fontSize);
    }

    public boolean isWidthCalculationReliable(PDFont font) {
        if (font == null) return false;

        try {
            if (font.isDamaged()) return false;
        } catch (Exception e) {
        }

        try {
            if (!TextEncodingHelper.canCalculateBasicWidths(font)) return false;
        } catch (Exception e) {
        }

        try {
            font.getStringWidth("A");
            return true;
        } catch (Exception e) {
        }

        try {
            font.getAverageFontWidth();
            return true;
        } catch (Exception e) {
        }

        try {
            float width = font.getWidth(65);
            return width >= 0;
        } catch (Exception e) {
        }

        return false;
    }

    public float calculateMinimumTextWidth(PDFont font, String text, float fontSize) {
        if (font == null || text == null || text.isEmpty() || fontSize <= 0) {
            return 0;
        }

        try {
            float minWidth = calculateAccurateWidth(font, text, fontSize);
            if (minWidth > 0) {
                return minWidth * 0.8f;
            }
        } catch (Exception e) {
        }

        return text.length() * fontSize * 0.3f;
    }

    public float calculateMaximumTextWidth(PDFont font, String text, float fontSize) {
        if (font == null || text == null || text.isEmpty() || fontSize <= 0) {
            return 0;
        }

        try {
            float maxWidth = calculateAccurateWidth(font, text, fontSize);
            if (maxWidth > 0) {
                return maxWidth * 1.2f;
            }
        } catch (Exception e) {
        }

        return text.length() * fontSize * 1.0f;
    }

    public boolean canCalculateWidthForText(PDFont font, String text) {
        if (font == null || text == null) {
            return false;
        }

        if (text.isEmpty()) {
            return true;
        }

        try {
            Float width = calculateDirectWidth(font, text, 12f);
            if (width != null) {
                return true;
            }
        } catch (Exception e) {
        }

        try {
            Float width = calculateCharacterByCharacterWidth(font, text, 12f);
            if (width != null) {
                return true;
            }
        } catch (Exception e) {
        }

        return true;
    }
}
