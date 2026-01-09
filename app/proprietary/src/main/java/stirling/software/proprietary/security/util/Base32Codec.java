package stirling.software.proprietary.security.util;

import java.io.ByteArrayOutputStream;
import java.util.Arrays;
import java.util.Locale;

public final class Base32Codec {

    private static final char[] ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".toCharArray();
    private static final int[] LOOKUP_TABLE = new int[128];

    static {
        Arrays.fill(LOOKUP_TABLE, -1);
        for (int i = 0; i < ALPHABET.length; i++) {
            LOOKUP_TABLE[ALPHABET[i]] = i;
        }
    }

    private Base32Codec() {}

    public static String encode(byte[] data) {
        if (data == null || data.length == 0) {
            return "";
        }

        StringBuilder result = new StringBuilder((data.length * 8 + 4) / 5);
        int buffer = data[0] & 0xFF;
        int bitsLeft = 8;
        int index = 1;

        while (bitsLeft > 0 || index < data.length) {
            if (bitsLeft < 5) {
                if (index < data.length) {
                    buffer = (buffer << 8) | (data[index++] & 0xFF);
                    bitsLeft += 8;
                } else {
                    int padding = 5 - bitsLeft;
                    buffer <<= padding;
                    bitsLeft += padding;
                }
            }

            int digit = (buffer >> (bitsLeft - 5)) & 0x1F;
            bitsLeft -= 5;
            result.append(ALPHABET[digit]);
        }

        return result.toString();
    }

    public static byte[] decode(String value) {
        if (value == null || value.isBlank()) {
            return new byte[0];
        }

        String normalized = value.replace("=", "").replace(" ", "").toUpperCase(Locale.ROOT);
        ByteArrayOutputStream output = new ByteArrayOutputStream(normalized.length());
        int buffer = 0;
        int bitsLeft = 0;

        for (char character : normalized.toCharArray()) {
            if (character >= LOOKUP_TABLE.length || LOOKUP_TABLE[character] == -1) {
                throw new IllegalArgumentException("Invalid Base32 character: " + character);
            }

            buffer = (buffer << 5) | LOOKUP_TABLE[character];
            bitsLeft += 5;

            if (bitsLeft >= 8) {
                output.write((buffer >> (bitsLeft - 8)) & 0xFF);
                bitsLeft -= 8;
            }
        }

        return output.toByteArray();
    }
}
