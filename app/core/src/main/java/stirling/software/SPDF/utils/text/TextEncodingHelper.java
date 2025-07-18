package stirling.software.SPDF.utils.text;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDSimpleFont;
import org.apache.pdfbox.pdmodel.font.encoding.DictionaryEncoding;
import org.apache.pdfbox.pdmodel.font.encoding.Encoding;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class TextEncodingHelper {

    public static boolean canEncodeCharacters(PDFont font, String text) {
        if (font == null || text == null || text.isEmpty()) {
            return false;
        }

        try {
            // Step 1: Primary check - full-string encoding (permissive for "good" cases)
            byte[] encoded = font.encode(text);
            if (encoded.length > 0) {
                log.debug(
                        "Text '{}' has good full-string encoding for font {} - permissively allowing",
                        text,
                        font.getName() != null ? font.getName() : "Unknown");
                return true;
            }

            // Step 2: Smart array-based fallback for TJ operator-style text
            log.debug(
                    "Full encoding failed for '{}' - using array-based fallback for font {}",
                    text,
                    font.getName() != null ? font.getName() : "Unknown");

            return validateAsCodePointArray(font, text);

        } catch (IOException | IllegalArgumentException e) {
            log.debug(
                    "Encoding exception for text '{}' with font {} - trying array fallback: {}",
                    text,
                    font.getName() != null ? font.getName() : "Unknown",
                    e.getMessage());

            if (isFontSubset(font.getName()) || hasCustomEncoding(font)) {
                return validateAsCodePointArray(font, text);
            }

            return false; // Non-subset fonts with encoding exceptions are likely problematic
        }
    }

    private static boolean validateAsCodePointArray(PDFont font, String text) {
        int totalCodePoints = 0;
        int successfulCodePoints = 0;

        // Iterate through code points (handles surrogates correctly per Unicode docs)
        for (int i = 0; i < text.length(); ) {
            int codePoint = text.codePointAt(i);
            String charStr = new String(Character.toChars(codePoint));
            totalCodePoints++;

            try {
                // Test encoding for this code point
                byte[] charEncoded = font.encode(charStr);
                if (charEncoded.length > 0) {
                    float charWidth = font.getStringWidth(charStr);

                    if (charWidth >= 0) {
                        successfulCodePoints++;
                        log.debug(
                                "Code point '{}' (U+{}) encoded successfully",
                                charStr,
                                Integer.toHexString(codePoint).toUpperCase());
                    } else {
                        log.debug(
                                "Code point '{}' (U+{}) has invalid width: {}",
                                charStr,
                                Integer.toHexString(codePoint).toUpperCase(),
                                charWidth);
                    }
                } else {
                    log.debug(
                            "Code point '{}' (U+{}) encoding failed - empty result",
                            charStr,
                            Integer.toHexString(codePoint).toUpperCase());
                }
            } catch (IOException | IllegalArgumentException e) {
                log.debug(
                        "Code point '{}' (U+{}) validation failed: {}",
                        charStr,
                        Integer.toHexString(codePoint).toUpperCase(),
                        e.getMessage());
            }

            i += Character.charCount(codePoint); // Handle surrogates properly
        }

        double successRate =
                totalCodePoints > 0 ? (double) successfulCodePoints / totalCodePoints : 0;
        boolean isAcceptable = successRate >= 0.95;

        log.debug(
                "Array validation for '{}': {}/{} code points successful ({:.1f}%) - {}",
                text,
                successfulCodePoints,
                totalCodePoints,
                successRate * 100,
                isAcceptable ? "ALLOWING" : "rejecting");

        return isAcceptable;
    }

    public static boolean isTextSegmentRemovable(PDFont font, String text) {
        if (font == null || text == null || text.isEmpty()) {
            return false;
        }

        // Log the attempt
        log.debug(
                "Evaluating text segment for removal: '{}' with font {}",
                text,
                font.getName() != null ? font.getName() : "Unknown Font");

        if (isSimpleCharacter(text)) {
            try {
                font.encode(text);
                font.getStringWidth(text);
                log.debug(
                        "Text '{}' is a simple character and passed validation - allowing removal",
                        text);
                return true;
            } catch (Exception e) {
                log.debug(
                        "Simple character '{}' failed basic validation with font {}: {}",
                        text,
                        font.getName() != null ? font.getName() : "Unknown",
                        e.getMessage());
                return false;
            }
        }

        // For complex text, require comprehensive validation
        return isTextFullyRemovable(font, text);
    }

    public static boolean isTextFullyRemovable(PDFont font, String text) {
        if (font == null || text == null || text.isEmpty()) {
            return false;
        }

        try {
            // Check 1: Verify encoding capability using new smart approach
            if (!canEncodeCharacters(font, text)) {
                log.debug(
                        "Text '{}' failed encoding validation for font {}",
                        text,
                        font.getName() != null ? font.getName() : "Unknown");
                return false;
            }

            // Check 2: Validate width calculation capability
            float width = font.getStringWidth(text);
            if (width < 0) { // Allow zero width (invisible chars) but reject negative (invalid)
                log.debug(
                        "Text '{}' has invalid width {} for font {}",
                        text,
                        width,
                        font.getName() != null ? font.getName() : "Unknown");
                return false; // Invalid metrics prevent accurate removal
            }

            // Check 3: Verify font descriptor completeness for redaction area calculation
            if (font.getFontDescriptor() == null) {
                log.debug(
                        "Missing font descriptor for font {}",
                        font.getName() != null ? font.getName() : "Unknown");
                return false;
            }

            // Check 4: Test bounding box calculation for redaction area
            try {
                font.getFontDescriptor().getFontBoundingBox();
            } catch (IllegalArgumentException e) {
                log.debug(
                        "Font bounding box unavailable for font {}: {}",
                        font.getName() != null ? font.getName() : "Unknown",
                        e.getMessage());
                return false;
            }

            log.debug(
                    "Text '{}' passed comprehensive validation for font {}",
                    text,
                    font.getName() != null ? font.getName() : "Unknown");
            return true;

        } catch (IOException e) {
            log.debug(
                    "Text '{}' failed validation for font {} due to IO error: {}",
                    text,
                    font.getName() != null ? font.getName() : "Unknown",
                    e.getMessage());
            return false;
        } catch (IllegalArgumentException e) {
            log.debug(
                    "Text '{}' failed validation for font {} due to argument error: {}",
                    text,
                    font.getName() != null ? font.getName() : "Unknown",
                    e.getMessage());
            return false;
        }
    }

    private static boolean isSimpleCharacter(String text) {
        if (text == null || text.isEmpty()) {
            return false;
        }

        if (text.length() > 20) {
            return false;
        }

        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);

            // Allow letters, digits, and whitespace (most common cases)
            if (Character.isLetterOrDigit(c) || Character.isWhitespace(c)) {
                continue;
            }

            // Allow common ASCII punctuation
            if (c >= 32 && c <= 126 && ".,!?;:()-[]{}\"'/@#$%&*+=<>|\\~`".indexOf(c) >= 0) {
                continue;
            }

            return false;
        }

        return true;
    }

    public static boolean hasCustomEncoding(PDFont font) {
        try {
            if (font instanceof PDSimpleFont simpleFont) {
                try {
                    Encoding encoding = simpleFont.getEncoding();
                    if (encoding != null) {
                        // Check for dictionary-based custom encodings
                        if (encoding instanceof DictionaryEncoding) {
                            log.debug("Font {} uses DictionaryEncoding (custom)", font.getName());
                            return true;
                        }

                        String encodingName = encoding.getClass().getSimpleName();
                        if (encodingName.contains("Custom")
                                || encodingName.contains("Dictionary")) {
                            log.debug(
                                    "Font {} uses custom encoding: {}",
                                    font.getName(),
                                    encodingName);
                            return true;
                        }
                    }
                } catch (Exception e) {
                    log.debug(
                            "Encoding detection failed for font {}: {}",
                            font.getName(),
                            e.getMessage());
                    return true; // Assume custom if detection fails
                }
            }

            if (font instanceof org.apache.pdfbox.pdmodel.font.PDType0Font) {
                log.debug(
                        "Font {} is Type0 (CID) - generally uses standard CMaps",
                        font.getName() != null ? font.getName() : "Unknown");
                return false;
            }

            log.debug(
                    "Font {} type {} - assuming standard encoding",
                    font.getName() != null ? font.getName() : "Unknown",
                    font.getClass().getSimpleName());
            return false;

        } catch (IllegalArgumentException e) {
            log.debug(
                    "Custom encoding detection failed for font {}: {}",
                    font.getName() != null ? font.getName() : "Unknown",
                    e.getMessage());
            return false; // Be forgiving on detection failure
        }
    }

    public static boolean fontSupportsCharacter(PDFont font, String character) {
        if (font == null || character == null || character.isEmpty()) {
            return false;
        }

        try {
            byte[] encoded = font.encode(character);
            if (encoded.length == 0) {
                return false;
            }

            float width = font.getStringWidth(character);
            return width > 0;

        } catch (IOException | IllegalArgumentException e) {
            log.debug(
                    "Character '{}' not supported by font {}: {}",
                    character,
                    font.getName() != null ? font.getName() : "Unknown",
                    e.getMessage());
            return false;
        }
    }

    public static boolean isFontSubset(String fontName) {
        if (fontName == null) {
            return false;
        }
        return fontName.matches("^[A-Z]{6}\\+.*");
    }

    public static boolean canCalculateBasicWidths(PDFont font) {
        try {
            float spaceWidth = font.getStringWidth(" ");
            if (spaceWidth <= 0) {
                return false;
            }

            String[] testChars = {"a", "A", "0", ".", "e", "!"};
            for (String ch : testChars) {
                try {
                    float width = font.getStringWidth(ch);
                    if (width > 0) {
                        return true;
                    }
                } catch (IOException | IllegalArgumentException e) {
                }
            }

            return false; // Can't calculate width for any test characters
        } catch (IOException | IllegalArgumentException e) {
            return false; // Font failed basic width calculation
        }
    }
}
