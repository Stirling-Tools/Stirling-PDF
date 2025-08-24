package stirling.software.SPDF.utils.text;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.Charset;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.font.*;

import lombok.experimental.UtilityClass;

import stirling.software.SPDF.service.RedactionService;

@UtilityClass
public class TextDecodingHelper {

    private final int ASCII_LOWER_BOUND = 32;
    private final int ASCII_UPPER_BOUND = 126;
    private final int EXTENDED_ASCII_LOWER_BOUND = 160;
    private final int EXTENDED_ASCII_UPPER_BOUND = 255;
    private final int PROBLEMATIC_CODE_LOWER_BOUND = 65488;
    private final int PROBLEMATIC_CODE_UPPER_BOUND = 65535;

    public PDFont getFontSafely(PDResources resources, COSName fontName) {
        if (resources == null || fontName == null) {
            return null;
        }

        try {
            PDFont font = resources.getFont(fontName);
            if (font == null) return null;
            try {
                String n = font.getName();
                if (n == null || n.trim().isEmpty()) return null;
            } catch (Exception e) {
                return null;
            }
            return font;
        } catch (Exception e) {
            return null;
        }
    }

    public void tryDecodeWithFontEnhanced(PDFont font, COSString cosString) {
        if (font == null || cosString == null) {
            return;
        }

        try {
            byte[] bytes = cosString.getBytes();
            if (bytes.length == 0) return;
            String basicDecoded = tryDecodeWithFont(font, cosString);
            if (basicDecoded != null
                    && !basicDecoded.contains("?")
                    && !basicDecoded.trim().isEmpty()) return;
            decodeCharactersEnhanced(font, bytes);
        } catch (Exception e) {
            try {
                tryDecodeWithFont(font, cosString);
            } catch (Exception ignored) {
            }
        }
    }

    public String decodeCharactersEnhanced(PDFont font, byte[] bytes) {
        // Try font-guided decoding first
        String fontPass = decodeByFontTables(font, bytes);
        if (isAcceptable(fontPass)) return fontPass;

        // Try UTF-8 strict decoding
        String utf8 = tryDecodeCharset(bytes, StandardCharsets.UTF_8);
        if (isAcceptable(utf8)) return utf8;

        // UTF-16 BE/LE
        String u16be = tryDecodeCharset(bytes, StandardCharsets.UTF_16BE);
        if (isAcceptable(u16be)) return u16be;

        String u16le = tryDecodeCharset(bytes, StandardCharsets.UTF_16LE);
        if (isAcceptable(u16le)) return u16le;

        // Common Windows encodings
        String win1252 = tryDecodeCharset(bytes, Charset.forName("windows-1252"));
        if (isAcceptable(win1252)) return win1252;

        String win1250 = tryDecodeCharset(bytes, Charset.forName("windows-1250"));
        if (isAcceptable(win1250)) return win1250;

        String gb2312 = tryDecodeCharset(bytes, Charset.forName("GB2312"));
        if (isAcceptable(gb2312)) return gb2312;

        String big5 = tryDecodeCharset(bytes, Charset.forName("Big5"));
        if (isAcceptable(big5)) return big5;

        String shiftJis = tryDecodeCharset(bytes, Charset.forName("Shift_JIS"));
        if (isAcceptable(shiftJis)) return shiftJis;

        String euckr = tryDecodeCharset(bytes, Charset.forName("EUC-KR"));
        if (isAcceptable(euckr)) return euckr;

        // Fallback to ISO-8859-1
        String latin1 = tryDecodeCharset(bytes, StandardCharsets.ISO_8859_1);
        return isAcceptable(latin1) ? latin1 : null;
    }

    private String decodeByFontTables(PDFont font, byte[] bytes) {
        if (font == null || bytes == null || bytes.length == 0) return null;
        StringBuilder out = new StringBuilder();
        int i = 0;
        while (i < bytes.length) {
            String ch = null;
            int consumed = 1;
            try {
                ch = tryToUnicode(font, bytes, i);
                if (ch == null && i + 1 < bytes.length) {
                    consumed = 2;
                    ch = tryToUnicode(font, bytes, i, 2);
                }
            } catch (Exception ignored) {
            }
            if (!isPrintable(ch)) {
                // Handle problematic character codes specifically
                ch = "�";
            }
            out.append(ch);
            i += consumed;
        }
        String s = out.toString();
        return isAcceptable(s) ? s : null;
    }

    private String tryToUnicode(PDFont font, byte[] bytes, int pos) {
        int code = bytes[pos] & 0xFF;
        try {
            return font.toUnicode(code);
        } catch (Exception e) {
            return null;
        }
    }

    private String tryToUnicode(PDFont font, byte[] bytes, int pos, int len) {
        if (pos + len - 1 >= bytes.length) return null;
        int code = 0;
        for (int j = 0; j < len; j++) code = (code << 8) | (bytes[pos + j] & 0xFF);
        try {
            return font.toUnicode(code);
        } catch (Exception e) {
            return null;
        }
    }

    private String tryDecodeCharset(byte[] bytes, Charset cs) {
        try {
            String s = new String(bytes, cs);
            return isPrintable(s) ? s : null;
        } catch (Exception e) {
            return null;
        }
    }

    private boolean isPrintable(String s) {
        if (s == null || s.isEmpty()) return false;
        int printable = 0;
        for (int i = 0; i < s.length(); ) {
            int cp = s.codePointAt(i);
            int type = Character.getType(cp);
            if (type != Character.CONTROL && type != Character.FORMAT && cp != 0xFFFD) printable++;
            i += Character.charCount(cp);
        }
        return printable >= Math.max(1, s.codePointCount(0, s.length()) * 3 / 4);
    }

    private boolean isAcceptable(String s) {
        return isPrintable(s);
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
            } catch (Exception ignored) {
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
            // Handle problematic high-range character codes that cause .notdef warnings
            if (code >= PROBLEMATIC_CODE_LOWER_BOUND && code <= PROBLEMATIC_CODE_UPPER_BOUND) {
                return handleProblematicCharacterCode(code, font);
            }

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
                if ((lowerName.contains("cjk")
                                || lowerName.contains("gb")
                                || lowerName.contains("jp"))
                        && code >= 0x4E00
                        && code <= 0x9FFF) {
                    return String.valueOf((char) code);
                }
            }

            try {
                if (bytes.length >= 2) {
                    ByteBuffer buffer = ByteBuffer.wrap(bytes);
                    CharsetDecoder decoder = StandardCharsets.UTF_16BE.newDecoder();
                    CharBuffer charBuffer = decoder.decode(buffer);
                    return charBuffer.toString();
                }
            } catch (Exception e) {

            }

            return null;
        } catch (Exception e) {
            return null;
        }
    }

    public String handleProblematicCharacterCode(int code, PDFont font) {
        if (code >= PROBLEMATIC_CODE_LOWER_BOUND && code <= PROBLEMATIC_CODE_UPPER_BOUND) {
            int adjustedCode = code - PROBLEMATIC_CODE_LOWER_BOUND;
            if (adjustedCode >= ASCII_LOWER_BOUND) {
                return String.valueOf((char) adjustedCode);
            }
            if (font != null && font.getName() != null && font.getName().contains("+")) {
                return mapSubsetCharacter(adjustedCode);
            }
        }
        return "�";
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

                    // Handle problematic multi-byte codes
                    if (u2 == null && code >= PROBLEMATIC_CODE_LOWER_BOUND) {
                        u2 = handleProblematicCharacterCode(code, font);
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

    public RedactionService.DecodedMapping buildDecodeMapping(PDFont font, byte[] bytes) {
        RedactionService.DecodedMapping map = new RedactionService.DecodedMapping();
        if (font == null || bytes == null) {
            map.setText("");
            map.setCharByteStart(new int[0]);
            map.setCharByteEnd(new int[0]);
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
            String decodedChar;
            int consumed;

            try {
                if (isType0) {
                    decodedChar = decodeType0Font((PDType0Font) font, bytes, i);
                    consumed = getType0CharLength((PDType0Font) font, bytes, i);
                } else if (isType1) {
                    decodedChar = decodeType1Font((PDType1Font) font, bytes, i);
                    consumed = 1;
                } else if (isType3) {
                    decodedChar = decodeType3Font((PDType3Font) font, bytes, i);
                    consumed = 1;
                } else if (isTrueType) {
                    decodedChar = decodeTrueTypeFont((PDTrueTypeFont) font, bytes, i);
                    consumed = getTrueTypeCharLength((PDTrueTypeFont) font, bytes, i);
                } else {
                    decodedChar = decodeGenericFont(font, bytes, i);
                    consumed = 1;
                }
                if (consumed <= 0 || i + consumed > bytes.length) consumed = 1;
            } catch (Exception e) {
                decodedChar = null;
                consumed = 1;
            }

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

        map.setText(sb.toString());
        map.setCharByteStart(starts.stream().mapToInt(Integer::intValue).toArray());
        map.setCharByteEnd(ends.stream().mapToInt(Integer::intValue).toArray());
        return map;
    }

    private String decodeType0Font(PDType0Font font, byte[] bytes, int position) {
        try {
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

    private int getType0CharLength(PDType0Font font, byte[] bytes, int position) {
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

    private String decodeType1Font(PDType1Font font, byte[] bytes, int position) {
        try {
            int code = bytes[position] & 0xFF;
            return font.toUnicode(code);
        } catch (Exception e) {
            return null;
        }
    }

    private String decodeType3Font(PDType3Font font, byte[] bytes, int position) {
        try {
            int code = bytes[position] & 0xFF;
            return font.toUnicode(code);
        } catch (Exception e) {
            return null;
        }
    }

    private String decodeTrueTypeFont(PDTrueTypeFont font, byte[] bytes, int position) {
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

    private int getTrueTypeCharLength(PDTrueTypeFont font, byte[] bytes, int position) {
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

    private String decodeGenericFont(PDFont font, byte[] bytes, int position) {
        try {
            int code = bytes[position] & 0xFF;
            return font.toUnicode(code);
        } catch (Exception e) {
            return null;
        }
    }

    private String handleUndecodableChar(byte[] bytes, int position, int length) {

        try {
            byte[] charBytes = new byte[length];
            System.arraycopy(bytes, position, charBytes, 0, length);
            String fallback = new String(charBytes, StandardCharsets.ISO_8859_1);
            if (!fallback.trim().isEmpty()) {
                return fallback;
            }
        } catch (Exception e) {
        }
        return "�";
    }
}
