package stirling.software.SPDF.utils.text;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@UtilityClass
public class WidthCalculator {

    private final int FONT_SCALE_FACTOR = 1000;
    private final float CONSERVATIVE_CHAR_WIDTH_RATIO = 0.55f;
    private final float BBOX_CHAR_WIDTH_RATIO = 0.65f;

    private final Map<String, Float> widthCache = new ConcurrentHashMap<>();
    private final Map<String, Boolean> reliabilityCache = new ConcurrentHashMap<>();

    private String createCacheKey(PDFont font, String text, float fontSize) {
        return String.format("%s|%s|%.2f", font.getName(), text, fontSize);
    }

    private String createReliabilityCacheKey(PDFont font) {
        return font.getName();
    }

    public float calculateAccurateWidth(PDFont font, String text, float fontSize) {
        return calculateAccurateWidth(font, text, fontSize, true);
    }

    public float calculateAccurateWidth(
            PDFont font, String text, float fontSize, boolean useCache) {
        if (font == null || text == null || text.isEmpty() || fontSize <= 0) return 0;

        if (useCache) {
            String cacheKey = createCacheKey(font, text, fontSize);
            Float cachedWidth = widthCache.get(cacheKey);
            if (cachedWidth != null) return cachedWidth;
        }

        String normalizedText = normalizeText(text);

        Float directWidth = calculateDirectWidth(font, normalizedText, fontSize);
        if (directWidth != null) {
            if (useCache) widthCache.put(createCacheKey(font, text, fontSize), directWidth);
            return directWidth;
        }

        Float charByCharWidth = calculateCharacterByCharacterWidth(font, normalizedText, fontSize);
        if (charByCharWidth != null) {
            if (useCache) widthCache.put(createCacheKey(font, text, fontSize), charByCharWidth);
            return charByCharWidth;
        }

        Float glyphWidth = calculateGlyphBasedWidth(font, normalizedText, fontSize);
        if (glyphWidth != null) {
            if (useCache) widthCache.put(createCacheKey(font, text, fontSize), glyphWidth);
            return glyphWidth;
        }

        float fallbackWidth = calculateComprehensiveFallbackWidth(font, normalizedText, fontSize);
        if (useCache) widthCache.put(createCacheKey(font, text, fontSize), fallbackWidth);
        return fallbackWidth;
    }

    private String normalizeText(String text) {
        return Normalizer.normalize(text, Normalizer.Form.NFC);
    }

    private Float calculateDirectWidth(PDFont font, String text, float fontSize) {
        if (!TextEncodingHelper.canEncodeCharacters(font, text)) return null;

        try {
            float rawWidth = font.getStringWidth(text);
            float scaledWidth = (rawWidth / FONT_SCALE_FACTOR) * fontSize;
            return rawWidth >= 0 && scaledWidth >= 0 ? scaledWidth : null;
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
                Float charWidth = calculateSingleCharacterWidth(font, character, fontSize);

                totalWidth += charWidth;
                if (previousCodePoint != -1) {
                    totalWidth += calculateKerning(font, previousCodePoint, codePoint, fontSize);
                }
                previousCodePoint = codePoint;
            }
            return totalWidth;
        } catch (Exception e) {
            return null;
        }
    }

    private List<Integer> getCodePoints(String text) {
        List<Integer> codePoints = new ArrayList<>();
        for (int i = 0; i < text.length(); ) {
            int codePoint = text.codePointAt(i);
            codePoints.add(codePoint);
            i += Character.charCount(codePoint);
        }
        return codePoints;
    }

    private Float calculateSingleCharacterWidth(PDFont font, String character, float fontSize) {
        try {
            byte[] encoded = null;

            try {
                encoded = font.encode(character);
                if (encoded.length == 0) encoded = null;
            } catch (Exception e) {
                log.debug("Direct encoding failed for '{}': {}", character, e.getMessage());
            }

            if (encoded == null && font instanceof PDType0Font) {
                try {
                    encoded = character.getBytes(StandardCharsets.UTF_8);
                } catch (Exception e) {
                    log.debug("UTF-8 encoding failed for '{}': {}", character, e.getMessage());
                }
            }

            if (encoded != null && encoded.length > 0) {
                Float width = calculateGlyphWidth(font, encoded, fontSize);
                if (width != null && width >= 0) return width;
            }

            return calculateAverageCharacterWidth(font, fontSize);

        } catch (Exception e) {
            log.debug(
                    "Single character width calculation failed for '{}': {}",
                    character,
                    e.getMessage());
            return calculateAverageCharacterWidth(font, fontSize);
        }
    }

    private Float calculateGlyphWidth(PDFont font, byte[] encoded, float fontSize) {
        for (byte b : encoded) {
            try {
                int glyphCode = b & 0xFF;
                float glyphWidth = font.getWidth(glyphCode);

                if (glyphWidth > 0) {
                    return (glyphWidth / FONT_SCALE_FACTOR) * fontSize;
                }

                // Try alternative width methods
                try {
                    glyphWidth = font.getWidthFromFont(glyphCode);
                    if (glyphWidth > 0) {
                        return (glyphWidth / FONT_SCALE_FACTOR) * fontSize;
                    }
                } catch (Exception e) {
                    log.debug(
                            "getWidthFromFont failed for glyph {}: {}", glyphCode, e.getMessage());
                }

            } catch (Exception e) {
                log.debug("Glyph width calculation failed for byte {}: {}", b, e.getMessage());
            }
        }
        return null;
    }

    private float calculateKerning(
            PDFont font, int leftCodePoint, int rightCodePoint, float fontSize) {
        return 0;
    }

    private Float calculateGlyphBasedWidth(PDFont font, String text, float fontSize) {
        try {
            float totalWidth = 0;

            for (int i = 0; i < text.length(); ) {
                int codePoint = text.codePointAt(i);
                String character = new String(Character.toChars(codePoint));

                // Try to get glyph information more comprehensively
                Float charWidth =
                        calculateGlyphWidthComprehensively(font, character, codePoint, fontSize);
                if (charWidth == null) {
                    return null;
                }

                totalWidth += charWidth;
                i += Character.charCount(codePoint);
            }

            log.debug("Glyph-based width calculation: {}", totalWidth);
            return totalWidth;

        } catch (Exception e) {
            log.debug("Glyph-based calculation failed: {}", e.getMessage());
            return null;
        }
    }

    private Float calculateGlyphWidthComprehensively(
            PDFont font, String character, int codePoint, float fontSize) {
        try {
            // Method 1: Try standard encoding
            try {
                byte[] encoded = font.encode(character);
                if (encoded.length > 0) {
                    Float width = calculateWidthFromEncodedBytes(font, encoded, fontSize);
                    if (width != null && width >= 0) {
                        return width;
                    }
                }
            } catch (Exception e) {
                log.debug(
                        "Standard encoding failed for U+{}: {}",
                        Integer.toHexString(codePoint),
                        e.getMessage());
            }

            // Method 2: Try Unicode code point directly
            try {
                float glyphWidth = font.getWidth(codePoint);
                if (glyphWidth > 0) {
                    return (glyphWidth / FONT_SCALE_FACTOR) * fontSize;
                }
            } catch (Exception e) {
                log.debug(
                        "Unicode code point width failed for U+{}: {}",
                        Integer.toHexString(codePoint),
                        e.getMessage());
            }

            // Method 3: Character category based estimation
            return calculateCategoryBasedWidth(font, codePoint, fontSize);

        } catch (Exception e) {
            log.debug("Comprehensive glyph width calculation failed: {}", e.getMessage());
            return calculateAverageCharacterWidth(font, fontSize);
        }
    }

    private Float calculateWidthFromEncodedBytes(PDFont font, byte[] encoded, float fontSize) {
        // Try each byte as a potential glyph code
        for (byte b : encoded) {
            try {
                int glyphCode = b & 0xFF;
                float width = font.getWidth(glyphCode);
                if (width > 0) {
                    return (width / FONT_SCALE_FACTOR) * fontSize;
                }
            } catch (Exception e) {
                // Continue trying other bytes
            }
        }

        if (encoded.length >= 2 && font instanceof PDType0Font) {
            try {
                int glyphCode = ((encoded[0] & 0xFF) << 8) | (encoded[1] & 0xFF);
                float width = font.getWidth(glyphCode);
                if (width > 0) {
                    return (width / FONT_SCALE_FACTOR) * fontSize;
                }
            } catch (Exception e) {
                log.debug("Multi-byte glyph code interpretation failed: {}", e.getMessage());
            }
        }

        return null;
    }

    private Float calculateCategoryBasedWidth(PDFont font, int codePoint, float fontSize) {
        try {
            int category = Character.getType(codePoint);
            float baseWidth = calculateAverageCharacterWidth(font, fontSize);

            // Adjust width based on character category
            float multiplier =
                    switch (category) {
                        case Character.UPPERCASE_LETTER -> 1.2f;
                        case Character.LOWERCASE_LETTER -> 1.0f;
                        case Character.DECIMAL_DIGIT_NUMBER -> 1.0f;
                        case Character.SPACE_SEPARATOR -> 0.5f;
                        case Character.DASH_PUNCTUATION -> 0.8f;
                        case Character.OTHER_PUNCTUATION -> 0.6f;
                        case Character.CURRENCY_SYMBOL -> 1.1f;
                        case Character.MATH_SYMBOL -> 1.0f;
                        case Character.MODIFIER_LETTER -> 0.7f;
                        case Character.NON_SPACING_MARK -> 0.0f; // Combining characters
                        case Character.ENCLOSING_MARK -> 0.0f;
                        case Character.COMBINING_SPACING_MARK -> 0.3f;
                        default -> 1.0f;
                    };

            return baseWidth * multiplier;
        } catch (Exception e) {
            log.debug("Category-based width calculation failed: {}", e.getMessage());
            return calculateAverageCharacterWidth(font, fontSize);
        }
    }

    private float calculateAverageCharacterWidth(PDFont font, float fontSize) {
        try {
            float avgWidth = font.getAverageFontWidth();
            return (avgWidth / FONT_SCALE_FACTOR) * fontSize;
        } catch (Exception e) {
            log.debug("Average character width calculation failed: {}", e.getMessage());
            return CONSERVATIVE_CHAR_WIDTH_RATIO * fontSize;
        }
    }

    private float calculateComprehensiveFallbackWidth(PDFont font, String text, float fontSize) {
        try {
            // Strategy 1: Use font bounding box with character analysis
            if (font.getFontDescriptor() != null
                    && font.getFontDescriptor().getFontBoundingBox() != null) {

                PDRectangle bbox = font.getFontDescriptor().getFontBoundingBox();
                float avgCharWidth = bbox.getWidth() / FONT_SCALE_FACTOR;

                // Analyze text composition for better estimation
                float adjustedWidth = analyzeTextComposition(text, avgCharWidth, fontSize);
                log.debug("Bounding box based fallback width: {}", adjustedWidth);
                return adjustedWidth;
            }

            // Strategy 2: Enhanced average width calculation
            float enhancedAverage = calculateEnhancedAverageWidth(font, text, fontSize);
            log.debug("Enhanced average fallback width: {}", enhancedAverage);
            return enhancedAverage;

        } catch (Exception e) {
            float conservativeWidth = text.length() * CONSERVATIVE_CHAR_WIDTH_RATIO * fontSize;
            log.debug("Conservative fallback width: {}", conservativeWidth);
            return conservativeWidth;
        }
    }

    private float analyzeTextComposition(String text, float avgCharWidth, float fontSize) {
        float totalWidth = 0;
        int spaceCount = 0;
        int upperCount = 0;
        int lowerCount = 0;
        int digitCount = 0;
        int punctCount = 0;

        for (int i = 0; i < text.length(); ) {
            int codePoint = text.codePointAt(i);
            int category = Character.getType(codePoint);

            switch (category) {
                case Character.SPACE_SEPARATOR -> {
                    spaceCount++;
                    totalWidth += avgCharWidth * 0.5f * fontSize;
                }
                case Character.UPPERCASE_LETTER -> {
                    upperCount++;
                    totalWidth += avgCharWidth * 1.2f * fontSize;
                }
                case Character.LOWERCASE_LETTER -> {
                    lowerCount++;
                    totalWidth += avgCharWidth * 1.0f * fontSize;
                }
                case Character.DECIMAL_DIGIT_NUMBER -> {
                    digitCount++;
                    totalWidth += avgCharWidth * 1.0f * fontSize;
                }
                case Character.OTHER_PUNCTUATION, Character.DASH_PUNCTUATION -> {
                    punctCount++;
                    totalWidth += avgCharWidth * 0.7f * fontSize;
                }
                default -> totalWidth += avgCharWidth * BBOX_CHAR_WIDTH_RATIO * fontSize;
            }

            i += Character.charCount(codePoint);
        }

        log.debug(
                "Text composition analysis - Spaces: {}, Upper: {}, Lower: {}, Digits: {}, Punct: {}",
                spaceCount,
                upperCount,
                lowerCount,
                digitCount,
                punctCount);

        return totalWidth;
    }

    private float calculateEnhancedAverageWidth(PDFont font, String text, float fontSize) {
        try {
            float baseAverage = font.getAverageFontWidth();

            float capHeight = 0;
            float xHeight = 0;

            if (font.getFontDescriptor() != null) {
                capHeight = font.getFontDescriptor().getCapHeight();
                xHeight = font.getFontDescriptor().getXHeight();
            }

            float adjustmentFactor = 1.0f;
            if (capHeight > 0 && xHeight > 0) {
                adjustmentFactor = Math.max(0.8f, Math.min(1.2f, xHeight / capHeight));
            }

            float adjustedAverage = (baseAverage * adjustmentFactor / FONT_SCALE_FACTOR) * fontSize;
            return text.length() * adjustedAverage;

        } catch (Exception e) {
            log.debug("Enhanced average width calculation failed: {}", e.getMessage());
            return text.length() * CONSERVATIVE_CHAR_WIDTH_RATIO * fontSize;
        }
    }

    public boolean isWidthCalculationReliable(PDFont font) {
        if (font == null) {
            return false;
        }

        String cacheKey = createReliabilityCacheKey(font);
        Boolean cachedResult = reliabilityCache.get(cacheKey);
        if (cachedResult != null) {
            log.debug(
                    "Using cached reliability result for font {}: {}",
                    font.getName(),
                    cachedResult);
            return cachedResult;
        }

        boolean result = performReliabilityCheck(font);

        reliabilityCache.put(cacheKey, result);
        return result;
    }

    private boolean performReliabilityCheck(PDFont font) {
        try {
            if (font.isDamaged()) {
                log.debug("Font {} is damaged", font.getName());
                return false;
            }

            if (!TextEncodingHelper.canCalculateBasicWidths(font)) {
                log.debug("Font {} cannot perform basic width calculations", font.getName());
                return false;
            }

            try {
                font.getStringWidth("A");
                return true;
            } catch (Exception e) {
                log.debug("Font {} failed basic width test: {}", font.getName(), e.getMessage());
            }

            // Check if we can at least get average width
            try {
                float avgWidth = font.getAverageFontWidth();
                return avgWidth > 0;
            } catch (Exception e) {
                log.debug(
                        "Font {} cannot provide average width: {}", font.getName(), e.getMessage());
            }

            return false;

        } catch (Exception e) {
            log.debug("Reliability check failed for font {}: {}", font.getName(), e.getMessage());
            return false;
        }
    }
}
