package stirling.software.SPDF.utils.text;

import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class WidthCalculator {

    private static final int FONT_SCALE_FACTOR = 1000;

    public static float calculateAccurateWidth(PDFont font, String text, float fontSize) {
        if (font == null || text == null || text.isEmpty() || fontSize <= 0) {
            return 0;
        }

        if (!TextEncodingHelper.canEncodeCharacters(font, text)) {
            log.debug(
                    "Text cannot be encoded by font {}, using fallback width calculation",
                    font.getName());
            return calculateFallbackWidth(font, text, fontSize);
        }

        try {
            float rawWidth = font.getStringWidth(text);
            float scaledWidth = (rawWidth / FONT_SCALE_FACTOR) * fontSize;

            log.debug(
                    "Direct width calculation successful for font {}: {} -> {}",
                    font.getName(),
                    rawWidth,
                    scaledWidth);
            return scaledWidth;

        } catch (Exception e) {
            log.debug(
                    "Direct width calculation failed for font {}: {}",
                    font.getName(),
                    e.getMessage());
            return calculateWidthWithCharacterIteration(font, text, fontSize);
        }
    }

    private static float calculateWidthWithCharacterIteration(
            PDFont font, String text, float fontSize) {
        try {
            float totalWidth = 0;

            for (int i = 0; i < text.length(); i++) {
                String character = text.substring(i, i + 1);
                try {
                    byte[] encoded = font.encode(character);
                    if (encoded.length > 0) {
                        int glyphCode = encoded[0] & 0xFF;
                        float glyphWidth = font.getWidth(glyphCode);

                        if (glyphWidth == 0) {
                            try {
                                glyphWidth = font.getWidthFromFont(glyphCode);
                            } catch (Exception e2) {
                                glyphWidth = font.getAverageFontWidth();
                            }
                        }

                        totalWidth += (glyphWidth / FONT_SCALE_FACTOR) * fontSize;
                    } else {
                        totalWidth += (font.getAverageFontWidth() / FONT_SCALE_FACTOR) * fontSize;
                    }
                } catch (Exception e2) {
                    totalWidth += (font.getAverageFontWidth() / FONT_SCALE_FACTOR) * fontSize;
                }
            }

            log.debug("Character iteration width calculation: {}", totalWidth);
            return totalWidth;

        } catch (Exception e) {
            log.debug("Character iteration failed: {}", e.getMessage());
            return calculateFallbackWidth(font, text, fontSize);
        }
    }

    private static float calculateFallbackWidth(PDFont font, String text, float fontSize) {
        try {
            if (font.getFontDescriptor() != null
                    && font.getFontDescriptor().getFontBoundingBox() != null) {

                PDRectangle bbox = font.getFontDescriptor().getFontBoundingBox();
                float avgCharWidth =
                        bbox.getWidth() / FONT_SCALE_FACTOR * 0.6f; // Conservative estimate
                float fallbackWidth = text.length() * avgCharWidth * fontSize;

                log.debug("Bounding box fallback width: {}", fallbackWidth);
                return fallbackWidth;
            }

            float avgWidth = font.getAverageFontWidth();
            float fallbackWidth = (text.length() * avgWidth / FONT_SCALE_FACTOR) * fontSize;

            log.debug("Average width fallback: {}", fallbackWidth);
            return fallbackWidth;

        } catch (Exception e) {
            float conservativeWidth = text.length() * 0.5f * fontSize;
            log.debug(
                    "Conservative fallback width for font {}: {}",
                    font.getName(),
                    conservativeWidth);
            return conservativeWidth;
        }
    }

    public static boolean isWidthCalculationReliable(PDFont font) {
        if (font == null) {
            return false;
        }

        if (font.isDamaged()) {
            log.debug("Font {} is damaged", font.getName());
            return false;
        }

        if (!TextEncodingHelper.canCalculateBasicWidths(font)) {
            log.debug("Font {} cannot perform basic width calculations", font.getName());
            return false;
        }

        if (TextEncodingHelper.hasCustomEncoding(font)) {
            log.debug("Font {} has custom encoding", font.getName());
            return false;
        }

        return true;
    }
}
