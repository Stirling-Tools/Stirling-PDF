package stirling.software.SPDF.utils.text;

import lombok.experimental.UtilityClass;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;

import lombok.extern.slf4j.Slf4j;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.StandardCharsets;

@Slf4j
@UtilityClass
public class TextDecodingHelper {

    private final int ASCII_LOWER_BOUND = 32;
    private final int ASCII_UPPER_BOUND = 126;
    private final int EXTENDED_ASCII_LOWER_BOUND = 160;
    private final int EXTENDED_ASCII_UPPER_BOUND = 255;

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

        if (charStr == null
            && font instanceof PDType0Font type0Font) {
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
                    CharsetDecoder decoder =
                        StandardCharsets.UTF_16BE.newDecoder();
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
}
