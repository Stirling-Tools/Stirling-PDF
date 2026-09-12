/**
 * Responsible for text encoding behavior used by the PDF JSON conversion workflow.
 *
 * <p>This class is intentionally empty for now. It exists to own the text encoding package and to
 * provide a stable extension point for future extraction of PDF text encoding logic.
 */
package stirling.software.SPDF.service.pdfjson.encoding;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import stirling.software.SPDF.model.json.PdfJsonFont;
import stirling.software.SPDF.model.json.PdfJsonFontType3Glyph;

public class PdfTextEncoder {

    private static final Logger log = LoggerFactory.getLogger(PdfTextEncoder.class);

    /** Remove control bytes from encoded PDF text sequences while preserving valid whitespace. */
    public static byte[] sanitizeEncoded(byte[] encoded) {
        if (encoded == null || encoded.length == 0) {
            return new byte[0];
        }
        ByteArrayOutputStream baos = new ByteArrayOutputStream(encoded.length);
        for (byte b : encoded) {
            if (isStrippedControlByte(b)) {
                continue;
            }
            baos.write(b);
        }
        byte[] sanitized = baos.toByteArray();
        if (sanitized.length == 0) {
            return sanitized;
        }
        return sanitized;
    }

    /** Returns true for control bytes that should be stripped from PDF text streams. */
    public static boolean isStrippedControlByte(byte value) {
        if (value == 0) {
            return true;
        }
        int unsigned = Byte.toUnsignedInt(value);
        if (unsigned <= 0x1F) {
            return !(unsigned == 0x09 || unsigned == 0x0A || unsigned == 0x0D);
        }
        return false;
    }

    public static byte[] encodeType3CharCodes(List<Integer> charCodes) {
        if (charCodes == null || charCodes.isEmpty()) {
            return null;
        }
        ByteArrayOutputStream baos = new ByteArrayOutputStream(charCodes.size());
        for (Integer code : charCodes) {
            if (code == null || code < 0 || code > 0xFF) {
                return null;
            }
            baos.write(code);
        }
        return baos.toByteArray();
    }

    public static byte[] encode(
            PDFont font, PdfJsonFont fontModel, String text, List<Integer> rawCharCodes)
            throws IOException {
        return encodeTextWithFont(font, fontModel, text, rawCharCodes);
    }

    private static byte[] encodeTextWithFont(
            PDFont font, PdfJsonFont fontModel, String text, List<Integer> rawCharCodes)
            throws IOException {
        boolean isType3Font = font instanceof PDType3Font;
        boolean hasType3Metadata =
                fontModel != null
                        && fontModel.getType3Glyphs() != null
                        && !fontModel.getType3Glyphs().isEmpty();

        // For normalized Type3 fonts (font is NOT Type3 but has Type3 metadata)
        if (!isType3Font && hasType3Metadata) {
            // If loaded as full font (not subset), use standard Unicode encoding
            // Try standard encoding first - this works when the font has all glyphs
            try {
                byte[] encoded = font.encode(text);
                // NOTE: Do NOT sanitize encoded bytes for normalized Type3 fonts
                // Multi-byte encodings (UTF-16BE, CID fonts) have null bytes that are essential
                // Removing them corrupts the byte boundaries and produces garbled text
                log.debug(
                        "[TYPE3] Encoded text '{}' for normalized font {}: encoded={} bytes",
                        text.length() > 20 ? text.substring(0, 20) + "..." : text,
                        fontModel.getId(),
                        encoded != null ? encoded.length : 0);
                if (encoded != null && encoded.length > 0) {
                    log.debug(
                            "[TYPE3] Successfully encoded text for normalized Type3 font {} using standard encoding",
                            fontModel.getId());
                    return encoded;
                }
                log.debug(
                        "[TYPE3] Standard encoding produced empty result for normalized Type3 font {}, falling through to Type3 mapping",
                        fontModel.getId());
            } catch (IOException | IllegalArgumentException ex) {
                log.debug(
                        "[TYPE3] Standard encoding failed for normalized Type3 font {}: {}",
                        fontModel.getId(),
                        ex.getMessage());
            }
            // If standard encoding failed, fall through to Type3 glyph mapping (for subset fonts)
            // or return null to trigger fallback font
        } else if (!isType3Font || fontModel == null) {
            // For non-Type3 fonts without Type3 metadata, use standard encoding
            try {
                byte[] encoded = font.encode(text);
                return sanitizeEncoded(encoded);
            } catch (IllegalArgumentException ex) {
                log.debug(
                        "[FONT-DEBUG] Font {} cannot encode text '{}': {}",
                        font.getName(),
                        text,
                        ex.getMessage());
                // Return null to trigger fallback font mechanism
                return null;
            }
        }

        // Type3 glyph mapping logic (for actual Type3 fonts AND normalized Type3 fonts)
        List<PdfJsonFontType3Glyph> glyphs = fontModel.getType3Glyphs();
        if (glyphs == null || glyphs.isEmpty()) {
            return null;
        }

        // For normalized Type3 fonts, DO NOT use rawCharCodes because:
        // 1. They may be stale if text was edited
        // 2. The subset font only has glyphs from the original PDF
        // Instead, try Type3 glyph mapping and return null if glyphs are missing
        // (null will trigger fallback font usage in the calling code)

        // Build Unicode to character code mapping from Type3 glyphs
        Map<Integer, Integer> unicodeToCode = new HashMap<>();
        for (PdfJsonFontType3Glyph glyph : glyphs) {
            if (glyph == null) {
                continue;
            }
            Integer unicode = glyph.getUnicode();
            Integer charCode = glyph.getCharCode();
            if (unicode == null || charCode == null) {
                continue;
            }
            unicodeToCode.putIfAbsent(unicode, charCode);
        }
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        boolean mappedAll = true;
        for (int offset = 0; offset < text.length(); ) {
            int codePoint = text.codePointAt(offset);
            offset += Character.charCount(codePoint);
            Integer charCode = unicodeToCode.get(codePoint);
            if (charCode == null) {
                log.debug(
                        "[TYPE3] Missing glyph mapping for code point U+{} in font {}",
                        Integer.toHexString(codePoint).toUpperCase(Locale.ROOT),
                        fontModel.getId());
                mappedAll = false;
                break;
            }
            if (charCode < 0 || charCode > 0xFF) {
                log.debug(
                        "[TYPE3] Unsupported Type3 charCode {} for font {} (only 1-byte codes supported)",
                        charCode,
                        fontModel.getId());
                mappedAll = false;
                break;
            }
            baos.write(charCode);
        }
        if (mappedAll) {
            return sanitizeEncoded(baos.toByteArray());
        }
        // Fallback to rawCharCodes for actual Type3 fonts if mapping failed
        if (rawCharCodes != null && !rawCharCodes.isEmpty()) {
            boolean valid = true;
            ByteArrayOutputStream fallbackBytes = new ByteArrayOutputStream(rawCharCodes.size());
            for (Integer code : rawCharCodes) {
                if (code == null || code < 0 || code > 0xFF) {
                    valid = false;
                    break;
                }
                fallbackBytes.write(code);
            }
            if (valid) {
                return fallbackBytes.toByteArray();
            }
        }
        return null;
    }
}
