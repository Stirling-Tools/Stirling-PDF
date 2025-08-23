package stirling.software.SPDF.utils.text;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.font.*;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.RedactionService;

@Slf4j
@UtilityClass
public class TextDecodingHelper {

    private final int ASCII_LOWER_BOUND = 32;
    private final int ASCII_UPPER_BOUND = 126;
    private final int EXTENDED_ASCII_LOWER_BOUND = 160;
    private final int EXTENDED_ASCII_UPPER_BOUND = 255;

    public PDFont getFontSafely(PDResources resources, COSName fontName) {
        if (resources == null || fontName == null) {
            return null;
        }

        try {
            PDFont font = resources.getFont(fontName);
            if (font == null) {
                return null;
            }

            try {
                String fontNameCheck = font.getName();
                if (fontNameCheck == null || fontNameCheck.trim().isEmpty()) {
                    log.debug("Font {} has null or empty name, skipping", fontName.getName());
                    return null;
                }
            } catch (Exception e) {
                log.debug(
                        "Error accessing font name for {}, skipping: {}",
                        fontName.getName(),
                        e.getMessage());
                return null;
            }

            return font;
        } catch (Exception e) {
            log.debug("Error retrieving font {}: {}", fontName.getName(), e.getMessage());
            return null;
        }
    }

    public void tryDecodeWithFontEnhanced(PDFont font, COSString cosString) {
        if (font == null || cosString == null) {
            return;
        }

        try {
            byte[] bytes = cosString.getBytes();
            if (bytes.length == 0) {
                return;
            }

            String basicDecoded = tryDecodeWithFont(font, cosString);
            if (basicDecoded != null
                    && !basicDecoded.contains("?")
                    && !basicDecoded.trim().isEmpty()) {
                return;
            }

            decodeCharactersEnhanced(font, bytes);

        } catch (Exception e) {
            log.error("Decoding failed: {}", e.getMessage(), e);
            try {
                tryDecodeWithFont(font, cosString);
            } catch (Exception fallbackException) {
            }
        }
    }

    public String decodeCharactersEnhanced(PDFont font, byte[] bytes) {
        StringBuilder out = new StringBuilder();
        boolean hasValidCharacters = false;
        int i = 0;
        while (i < bytes.length) {
            int code = bytes[i] & 0xFF;
            String charStr = decodeSingleCharacter(font, code, bytes);

            if (charStr == null && code >= 128 && i + 1 < bytes.length) {
                int combinedCode = (code << 8) | (bytes[i + 1] & 0xFF);
                charStr = decodeSingleCharacter(font, combinedCode, bytes);
                if (charStr != null) {
                    i += 2; // Skip the next byte
                    out.append(charStr);
                    hasValidCharacters = true;
                    continue;
                }
            }

            if (charStr != null && !charStr.isEmpty()) {
                out.append(charStr);
                hasValidCharacters = true;
            } else {
                out.append('?');
            }
            i++;
        }
        String result = out.toString();
        return hasValidCharacters ? result : null;
    }

    public String decodeSingleCharacter(PDFont font, int code, byte[] bytes) {
        String charStr = null;

        try {
            charStr = font.toUnicode(code);
        } catch (Exception ignored) {
        }

        if (charStr == null && font instanceof PDType0Font type0Font) {
            try {
                int cid = (bytes.length > 1) ? ((bytes[0] & 0xFF) << 8) | (bytes[1] & 0xFF) : code;
                charStr = type0Font.toUnicode(cid);
                log.debug("CID decoding successful for code {}: {}", cid, charStr);
            } catch (Exception e) {
                log.debug("CID decoding failed for code {}: {}", code, e.getMessage());
            }
        }

        if (charStr == null && font.getName() != null && font.getName().contains("+")) {
            charStr = mapSubsetCharacter(code);
        }

        if (charStr == null) {
            charStr = fallbackCharacterMapping(code, bytes, font);
        }

        return charStr;
    }

    public String fallbackCharacterMapping(int code, byte[] bytes, PDFont font) {
        try {
            if (font instanceof PDType0Font && bytes.length > 1) {
                return null;
            }

            if (code >= ASCII_LOWER_BOUND && code <= ASCII_UPPER_BOUND) {
                return String.valueOf((char) code);
            }

            if (code >= EXTENDED_ASCII_LOWER_BOUND && code <= EXTENDED_ASCII_UPPER_BOUND) {
                return String.valueOf((char) code);
            }

            String fontName = font.getName();
            if (fontName != null) {
                String lowerName = fontName.toLowerCase();
                if (lowerName.contains("cjk")
                        || lowerName.contains("gb")
                        || lowerName.contains("jp")) {
                    // Basic CJK fallback (expand with a lookup table if needed)
                    if (code >= 0x4E00 && code <= 0x9FFF) {
                        return String.valueOf(
                                (char) code); // Unicode Basic Multilingual Plane for CJK
                    }
                }
            }

            // Fallback to UTF-8/16 decoding attempt for unknown encodings
            try {
                if (bytes.length >= 2) {
                    ByteBuffer buffer = ByteBuffer.wrap(bytes);
                    CharsetDecoder decoder = StandardCharsets.UTF_16BE.newDecoder();
                    CharBuffer charBuffer = decoder.decode(buffer);
                    return charBuffer.toString();
                }
            } catch (Exception e) {
                log.debug("UTF fallback failed: {}", e.getMessage());
            }

            return null;
        } catch (Exception e) {
            return null;
        }
    }

    public String mapSubsetCharacter(int code) {
        if (code >= ASCII_LOWER_BOUND && code <= ASCII_UPPER_BOUND) {
            return String.valueOf((char) code);
        }
        if (code >= EXTENDED_ASCII_LOWER_BOUND && code <= EXTENDED_ASCII_UPPER_BOUND) {
            return String.valueOf((char) (code - 128));
        }
        return null;
    }

    public String tryDecodeWithFont(PDFont font, COSString cosString) {
        try {
            if (font == null || cosString == null) {
                return null;
            }
            byte[] bytes = cosString.getBytes();
            if (bytes.length == 0) {
                return "";
            }
            boolean anyMapped = false;
            StringBuilder out = new StringBuilder();
            for (byte b : bytes) {
                int code = b & 0xFF;
                String uni = null;
                try {
                    uni = font.toUnicode(code);
                } catch (Exception ignored) {
                }
                if (uni != null) {
                    out.append(uni);
                    anyMapped = true;
                } else {
                    out.append('?');
                }
            }
            if (anyMapped) {
                return out.toString();
            }
            out.setLength(0);
            for (int i = 0; i < bytes.length; ) {
                int b1 = bytes[i] & 0xFF;
                String u1 = null;
                try {
                    u1 = font.toUnicode(b1);
                } catch (Exception ignored) {
                }
                if (i + 1 < bytes.length) {
                    int b2 = bytes[i + 1] & 0xFF;
                    int code = (b1 << 8) | b2;
                    String u2 = null;
                    try {
                        u2 = font.toUnicode(code);
                    } catch (Exception ignored) {
                    }
                    if (u2 != null) {
                        out.append(u2);
                        i += 2;
                        anyMapped = true;
                        continue;
                    }
                }
                if (u1 != null) {
                    out.append(u1);
                } else {
                    out.append('?');
                }
                i += 1;
            }
            return anyMapped ? out.toString() : null;
        } catch (Exception e) {
            return null;
        }
    }

    public static RedactionService.DecodedMapping buildDecodeMapping(PDFont font, byte[] bytes) {
        RedactionService.DecodedMapping map = new RedactionService.DecodedMapping();
        if (font == null || bytes == null) {
            map.text = "";
            map.charByteStart = new int[0];
            map.charByteEnd = new int[0];
            return map;
        }

        StringBuilder sb = new StringBuilder();
        List<Integer> starts = new ArrayList<>();
        List<Integer> ends = new ArrayList<>();
        int i = 0;

        // Determine font type and encoding characteristics
        boolean isType0 = font instanceof PDType0Font;
        boolean isType1 = font instanceof PDType1Font;
        boolean isType3 = font instanceof PDType3Font;
        boolean isTrueType = font instanceof PDTrueTypeFont;

        while (i < bytes.length) {
            int start = i;
            String decodedChar = null;
            int consumed = 1;

            try {
                if (isType0) {
                    // Handle CID fonts and multi-byte encodings
                    decodedChar = decodeType0Font((PDType0Font) font, bytes, i);
                    consumed = getType0CharLength((PDType0Font) font, bytes, i);
                } else if (isType1) {
                    // Handle Type1 fonts with specific encoding
                    decodedChar = decodeType1Font((PDType1Font) font, bytes, i);
                    consumed = getType1CharLength((PDType1Font) font, bytes, i);
                } else if (isType3) {
                    // Handle Type3 bitmap fonts
                    decodedChar = decodeType3Font((PDType3Font) font, bytes, i);
                    consumed = 1; // Type3 typically single byte
                } else if (isTrueType) {
                    // Handle TrueType fonts
                    decodedChar = decodeTrueTypeFont((PDTrueTypeFont) font, bytes, i);
                    consumed = getTrueTypeCharLength((PDTrueTypeFont) font, bytes, i);
                } else {
                    // Generic fallback for other font types
                    decodedChar = decodeGenericFont(font, bytes, i);
                    consumed = getGenericCharLength(font, bytes, i);
                }

                // Validate the consumed length
                if (consumed <= 0 || i + consumed > bytes.length) {
                    consumed = 1;
                }

            } catch (Exception e) {
                // Log the error for debugging purposes
                System.err.println(
                        "Error decoding character at position " + i + ": " + e.getMessage());
                decodedChar = null;
                consumed = 1;
            }

            // Handle null or empty decoded characters
            if (decodedChar == null || decodedChar.isEmpty()) {
                decodedChar = handleUndecodableChar(bytes, i, consumed);
            }

            int end = i + consumed;

            // Add each Unicode character separately
            for (int k = 0; k < decodedChar.length(); k++) {
                sb.append(decodedChar.charAt(k));
                starts.add(start);
                ends.add(end);
            }

            i += consumed;
        }

        map.text = sb.toString();
        map.charByteStart = starts.stream().mapToInt(Integer::intValue).toArray();
        map.charByteEnd = ends.stream().mapToInt(Integer::intValue).toArray();
        return map;
    }

    private static String decodeType0Font(PDType0Font font, byte[] bytes, int position) {
        try {
            // Try multi-byte decoding first (common for CJK fonts)
            if (position + 1 < bytes.length) {
                int b1 = bytes[position] & 0xFF;
                int b2 = bytes[position + 1] & 0xFF;
                int code = (b1 << 8) | b2;
                String unicode = font.toUnicode(code);
                if (unicode != null && !unicode.isEmpty()) {
                    return unicode;
                }
            }

            int code = bytes[position] & 0xFF;
            return font.toUnicode(code);

        } catch (Exception e) {
            return null;
        }
    }

    private static int getType0CharLength(PDType0Font font, byte[] bytes, int position) {
        try {
            if (position + 1 < bytes.length) {
                int b1 = bytes[position] & 0xFF;
                int b2 = bytes[position + 1] & 0xFF;
                int code = (b1 << 8) | b2;
                String unicode = font.toUnicode(code);
                if (unicode != null && !unicode.isEmpty()) {
                    return 2;
                }
            }
            return 1;
        } catch (Exception e) {
            return 1;
        }
    }

    private static String decodeType1Font(PDType1Font font, byte[] bytes, int position) {
        try {
            int code = bytes[position] & 0xFF;
            return font.toUnicode(code);
        } catch (Exception e) {
            return null;
        }
    }

    private static int getType1CharLength(PDType1Font font, byte[] bytes, int position) {
        return 1; // Type1 fonts are typically single-byte
    }

    private static String decodeType3Font(PDType3Font font, byte[] bytes, int position) {
        try {
            int code = bytes[position] & 0xFF;
            return font.toUnicode(code);
        } catch (Exception e) {
            return null;
        }
    }

    private static String decodeTrueTypeFont(PDTrueTypeFont font, byte[] bytes, int position) {
        try {
            int code = bytes[position] & 0xFF;
            String unicode = font.toUnicode(code);

            if ((unicode == null || unicode.isEmpty()) && position + 1 < bytes.length) {
                int b1 = bytes[position] & 0xFF;
                int b2 = bytes[position + 1] & 0xFF;
                int multiByteCode = (b1 << 8) | b2;
                unicode = font.toUnicode(multiByteCode);
            }

            return unicode;
        } catch (Exception e) {
            return null;
        }
    }

    private static int getTrueTypeCharLength(PDTrueTypeFont font, byte[] bytes, int position) {
        try {
            // First try single byte
            int code = bytes[position] & 0xFF;
            String unicode = font.toUnicode(code);
            if (unicode != null && !unicode.isEmpty()) {
                return 1;
            }

            if (position + 1 < bytes.length) {
                int b1 = bytes[position] & 0xFF;
                int b2 = bytes[position + 1] & 0xFF;
                int multiByteCode = (b1 << 8) | b2;
                unicode = font.toUnicode(multiByteCode);
                if (unicode != null && !unicode.isEmpty()) {
                    return 2;
                }
            }

            return 1; // Default fallback
        } catch (Exception e) {
            return 1;
        }
    }

    private static String decodeGenericFont(PDFont font, byte[] bytes, int position) {
        try {
            int code = bytes[position] & 0xFF;
            return font.toUnicode(code);
        } catch (Exception e) {
            return null;
        }
    }

    private static int getGenericCharLength(PDFont font, byte[] bytes, int position) {
        return 1; // Default to single byte for unknown font types
    }

    private static String handleUndecodableChar(byte[] bytes, int position, int length) {

        // Or try to interpret as ISO-8859-1 (Latin-1) as fallback
        try {
            byte[] charBytes = new byte[length];
            System.arraycopy(bytes, position, charBytes, 0, length);
            String fallback = new String(charBytes, StandardCharsets.ISO_8859_1);
            if (!fallback.trim().isEmpty()) {
                return fallback;
            }
        } catch (Exception e) {
            // Ignore and fall through to default
        }

        return "�"; // Unicode replacement character instead of "?"
    }
}
