package stirling.software.common.util;

import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class RtfSanitizer {

    private static final List<String> FIELD_KEYWORDS =
            List.of("INCLUDEPICTURE", "INCLUDETEXT", "DDEAUTO", "IMPORT", "LINK", "DDE");

    private static final List<String> CONTROL_WORDS =
            List.of("objautlink", "objlink", "objupdate", "objdata", "fldinst");

    private static final byte MASK = (byte) 'x';

    public byte[] sanitize(byte[] rtfBytes) {
        if (rtfBytes == null || rtfBytes.length == 0) {
            return rtfBytes;
        }
        byte[] out = rtfBytes.clone();
        int masked = 0;
        int index = 0;

        while (index < out.length) {
            int binLength = binPayloadLength(out, index);
            if (binLength > 0) {
                index = Math.min(out.length, index + binLength);
                continue;
            }
            int consumed = maskAt(out, index);
            if (consumed > 0) {
                masked++;
                index += consumed;
                continue;
            }
            index++;
        }

        if (masked > 0) {
            log.warn("Neutralised {} external-reference construct(s) in RTF input", masked);
        }
        return out;
    }

    private int maskAt(byte[] data, int index) {
        for (String keyword : FIELD_KEYWORDS) {
            if (matchesAscii(data, index, keyword, true)) {
                maskRange(data, index, keyword.length());
                return keyword.length();
            }
        }
        if (data[index] == '\\') {
            for (String word : CONTROL_WORDS) {
                if ("fldinst".equals(word)) {
                    continue;
                }
                if (matchesAscii(data, index + 1, word, false)) {
                    maskRange(data, index + 1, word.length());
                    return word.length() + 1;
                }
            }
        }
        return 0;
    }

    private void maskRange(byte[] data, int from, int length) {
        for (int i = from; i < from + length && i < data.length; i++) {
            data[i] = MASK;
        }
    }

    private boolean matchesAscii(byte[] data, int index, String token, boolean ignoreCase) {
        if (index < 0 || index + token.length() > data.length) {
            return false;
        }
        for (int i = 0; i < token.length(); i++) {
            char actual = (char) (data[index + i] & 0xFF);
            char expected = token.charAt(i);
            if (ignoreCase) {
                actual = Character.toUpperCase(actual);
                expected = Character.toUpperCase(expected);
            } else {
                actual = Character.toLowerCase(actual);
                expected = Character.toLowerCase(expected);
            }
            if (actual != expected) {
                return false;
            }
        }
        return true;
    }

    private int binPayloadLength(byte[] data, int index) {
        if (data[index] != '\\' || !matchesAscii(data, index + 1, "bin", false)) {
            return 0;
        }
        int cursor = index + 4;
        StringBuilder digits = new StringBuilder();
        while (cursor < data.length && Character.isDigit((char) (data[cursor] & 0xFF))) {
            digits.append((char) (data[cursor] & 0xFF));
            cursor++;
        }
        if (digits.isEmpty()) {
            return 0;
        }
        if (cursor < data.length && (data[cursor] == ' ' || data[cursor] == '\r')) {
            cursor++;
        }
        long payload;
        try {
            payload = Long.parseLong(digits.toString(), 10);
        } catch (NumberFormatException e) {
            log.debug(
                    "Unparsable RTF \\bin length: {}", digits.toString().toLowerCase(Locale.ROOT));
            return 0;
        }
        if (payload < 0) {
            return 0;
        }
        long total = (long) (cursor - index) + payload;
        return (int) Math.min(total, Integer.MAX_VALUE);
    }
}
