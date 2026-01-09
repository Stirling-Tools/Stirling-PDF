package stirling.software.proprietary.security.util;

import java.io.ByteArrayOutputStream;
import java.util.Arrays;
import java.util.Locale;

/**
 * RFC 4648 Base32 encoder/decoder for handling TOTP secrets.
 *
 * <p>This implementation is used to encode binary secrets into Base32 strings and decode them back
 * into byte arrays for TOTP processing.
 */
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

    /**
     * Encodes the provided bytes into a Base32 string.
     *
     * @param data the raw bytes to encode
     * @return Base32-encoded representation of the input, or an empty string for null/empty input
     */
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

    /**
     * Decodes a Base32 string into raw bytes.
     *
     * @param value Base32-encoded string (padding and whitespace are ignored)
     * @return decoded byte array, or an empty array for null/blank input
     * @throws IllegalArgumentException when the input contains invalid Base32 characters
     */
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
