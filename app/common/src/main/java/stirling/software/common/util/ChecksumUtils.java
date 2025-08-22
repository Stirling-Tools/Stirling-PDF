package stirling.software.common.util;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.zip.Adler32;
import java.util.zip.CRC32;
import java.util.zip.Checksum;

import lombok.experimental.UtilityClass;

@UtilityClass
public class ChecksumUtils {

    /** Shared buffer size for streaming I/O. */
    private static final int BUFFER_SIZE = 8192;

    /** Mask to extract the lower 32 bits of a long value (unsigned int). */
    private static final long UNSIGNED_32_BIT_MASK = 0xFFFFFFFFL;

    /**
     * Computes a checksum for the given file using the chosen algorithm and returns a lowercase hex
     * string.
     *
     * <p>For digest algorithms (e.g., SHA-256, SHA-1, MD5), this returns the digest as hex. For
     * 32-bit {@link Checksum} algorithms ("CRC32", "ADLER32"), this returns an 8-character
     * lowercase hex string of the unsigned 32-bit value.
     *
     * @param path file to read
     * @param algorithm algorithm name (case-insensitive). Special values: "CRC32", "ADLER32".
     * @return hex string of the checksum
     * @throws IOException if the file cannot be read
     */
    public static String checksum(Path path, String algorithm) throws IOException {
        try (InputStream is = Files.newInputStream(path)) {
            return checksum(is, algorithm);
        }
    }

    /**
     * Computes a checksum for the given stream using the chosen algorithm and returns a lowercase
     * hex string.
     *
     * <p><strong>Note:</strong> This method does <em>not</em> close the provided stream.
     *
     * @param is input stream (not closed by this method)
     * @param algorithm algorithm name (case-insensitive). Special values: "CRC32", "ADLER32".
     * @return hex string of the checksum
     * @throws IOException if reading from the stream fails
     */
    public static String checksum(InputStream is, String algorithm) throws IOException {
        switch (algorithm.toUpperCase(Locale.ROOT)) {
            case "CRC32":
                return checksumChecksum(is, new CRC32());
            case "ADLER32":
                return checksumChecksum(is, new Adler32());
            default:
                return toHex(checksumBytes(is, algorithm));
        }
    }

    /**
     * Computes a checksum for the given file using the chosen algorithm and returns a Base64
     * encoded string.
     *
     * <p>For digest algorithms this is the Base64 of the raw digest bytes. For 32-bit checksum
     * algorithms ("CRC32", "ADLER32"), this is the Base64 of the 4-byte big-endian unsigned value.
     *
     * @param path file to read
     * @param algorithm algorithm name (case-insensitive). Special values: "CRC32", "ADLER32".
     * @return Base64-encoded checksum bytes
     * @throws IOException if the file cannot be read
     */
    public static String checksumBase64(Path path, String algorithm) throws IOException {
        try (InputStream is = Files.newInputStream(path)) {
            return checksumBase64(is, algorithm);
        }
    }

    /**
     * Computes a checksum for the given stream using the chosen algorithm and returns a Base64
     * encoded string.
     *
     * <p><strong>Note:</strong> This method does <em>not</em> close the provided stream.
     *
     * @param is input stream (not closed by this method)
     * @param algorithm algorithm name (case-insensitive). Special values: "CRC32", "ADLER32".
     * @return Base64-encoded checksum bytes
     * @throws IOException if reading from the stream fails
     */
    public static String checksumBase64(InputStream is, String algorithm) throws IOException {
        switch (algorithm.toUpperCase(Locale.ROOT)) {
            case "CRC32":
                return Base64.getEncoder().encodeToString(checksumChecksumBytes(is, new CRC32()));
            case "ADLER32":
                return Base64.getEncoder().encodeToString(checksumChecksumBytes(is, new Adler32()));
            default:
                return Base64.getEncoder().encodeToString(checksumBytes(is, algorithm));
        }
    }

    /**
     * Computes multiple checksums for the given file in a single pass over the data.
     *
     * <p>Returns a map from algorithm name to lowercase hex string. Order of results follows the
     * order of the provided {@code algorithms}.
     *
     * @param path file to read
     * @param algorithms algorithm names (case-insensitive). Special: "CRC32", "ADLER32".
     * @return map of algorithm → hex string
     * @throws IOException if the file cannot be read
     */
    public static Map<String, String> checksums(Path path, String... algorithms)
            throws IOException {
        try (InputStream is = Files.newInputStream(path)) {
            return checksums(is, algorithms);
        }
    }

    /**
     * Computes multiple checksums for the given stream in a single pass over the data.
     *
     * <p><strong>Note:</strong> This method does <em>not</em> close the provided stream.
     *
     * @param is input stream (not closed by this method)
     * @param algorithms algorithm names (case-insensitive). Special: "CRC32", "ADLER32".
     * @return map of algorithm → hex string
     * @throws IOException if reading from the stream fails
     */
    public static Map<String, String> checksums(InputStream is, String... algorithms)
            throws IOException {
        // Use LinkedHashMap to preserve the order of requested algorithms in the result.
        Map<String, MessageDigest> digests = new LinkedHashMap<>();
        Map<String, Checksum> checksums = new LinkedHashMap<>();

        for (String algorithm : algorithms) {
            String key = algorithm; // keep original key for output
            switch (algorithm.toUpperCase(Locale.ROOT)) {
                case "CRC32":
                    checksums.put(key, new CRC32());
                    break;
                case "ADLER32":
                    checksums.put(key, new Adler32());
                    break;
                default:
                    try {
                        // For MessageDigest, pass the original name (case-insensitive per JCA)
                        digests.put(key, MessageDigest.getInstance(algorithm));
                    } catch (NoSuchAlgorithmException e) {
                        throw new IllegalStateException("Unsupported algorithm: " + algorithm, e);
                    }
            }
        }

        byte[] buffer = new byte[BUFFER_SIZE];
        int read;
        while ((read = is.read(buffer)) != -1) {
            for (MessageDigest digest : digests.values()) {
                digest.update(buffer, 0, read);
            }
            for (Checksum cs : checksums.values()) {
                cs.update(buffer, 0, read);
            }
        }

        Map<String, String> results = new LinkedHashMap<>();
        for (Map.Entry<String, MessageDigest> entry : digests.entrySet()) {
            results.put(entry.getKey(), toHex(entry.getValue().digest()));
        }
        for (Map.Entry<String, Checksum> entry : checksums.entrySet()) {
            // Keep value as long and mask to ensure unsigned hex formatting.
            long unsigned32 = entry.getValue().getValue() & UNSIGNED_32_BIT_MASK;
            results.put(entry.getKey(), String.format("%08x", unsigned32));
        }
        return results;
    }

    /**
     * Compares the checksum of a file with an expected hex string (case-insensitive).
     *
     * @param path file to read
     * @param algorithm algorithm name (case-insensitive). Special: "CRC32", "ADLER32".
     * @param expected expected hex string (case-insensitive)
     * @return {@code true} if they match, otherwise {@code false}
     * @throws IOException if the file cannot be read
     */
    public static boolean matches(Path path, String algorithm, String expected) throws IOException {
        try (InputStream is = Files.newInputStream(path)) {
            return matches(is, algorithm, expected);
        }
    }

    /**
     * Compares the checksum of a stream with an expected hex string (case-insensitive).
     *
     * <p><strong>Note:</strong> This method does <em>not</em> close the provided stream.
     *
     * @param is input stream (not closed by this method)
     * @param algorithm algorithm name (case-insensitive). Special: "CRC32", "ADLER32".
     * @param expected expected hex string (case-insensitive)
     * @return {@code true} if they match, otherwise {@code false}
     * @throws IOException if reading from the stream fails
     */
    public static boolean matches(InputStream is, String algorithm, String expected)
            throws IOException {
        return checksum(is, algorithm).equalsIgnoreCase(expected);
    }

    // ---------- Internal helpers ----------

    /**
     * Computes a MessageDigest over a stream and returns the raw digest bytes.
     *
     * @param is input stream (not closed)
     * @param algorithm JCA MessageDigest algorithm (e.g., "SHA-256")
     * @return raw digest bytes
     * @throws IOException if reading fails
     * @throws IllegalStateException if the algorithm is unsupported
     */
    private static byte[] checksumBytes(InputStream is, String algorithm) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance(algorithm);
            byte[] buffer = new byte[BUFFER_SIZE];
            int read;
            while ((read = is.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
            return digest.digest();
        } catch (NoSuchAlgorithmException e) {
            // Keep the message explicit to aid debugging
            throw new IllegalStateException("Unsupported algorithm: " + algorithm, e);
        }
    }

    /**
     * Computes a 32-bit {@link Checksum} over a stream and returns the lowercase 8-char hex of the
     * unsigned 32-bit value.
     *
     * @param is input stream (not closed)
     * @param checksum checksum implementation (CRC32, Adler32, etc.)
     * @return 8-character lowercase hex (big-endian representation)
     * @throws IOException if reading fails
     */
    private static String checksumChecksum(InputStream is, Checksum checksum) throws IOException {
        byte[] buffer = new byte[BUFFER_SIZE];
        int read;
        while ((read = is.read(buffer)) != -1) {
            checksum.update(buffer, 0, read);
        }
        // Keep as long and mask to ensure correct unsigned representation.
        long unsigned32 = checksum.getValue() & UNSIGNED_32_BIT_MASK;
        return String.format("%08x", unsigned32);
    }

    /**
     * Computes a 32-bit {@link Checksum} over a stream and returns the raw 4-byte big-endian
     * representation of the unsigned 32-bit value.
     *
     * <p>Cast to int already truncates to the lower 32 bits; the sign is irrelevant because we
     * serialize the bit pattern directly into 4 bytes.
     *
     * @param is input stream (not closed)
     * @param checksum checksum implementation (CRC32, Adler32, etc.)
     * @return 4 bytes (big-endian)
     * @throws IOException if reading fails
     */
    private static byte[] checksumChecksumBytes(InputStream is, Checksum checksum)
            throws IOException {
        byte[] buffer = new byte[BUFFER_SIZE];
        int read;
        while ((read = is.read(buffer)) != -1) {
            checksum.update(buffer, 0, read);
        }
        // Cast keeps only the lower 32 bits; mask is unnecessary here.
        int v = (int) checksum.getValue();
        return ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN).putInt(v).array();
    }

    /**
     * Converts bytes to a lowercase hex string.
     *
     * @param hash the byte array to convert
     * @return the lowercase hex string
     */
    private static String toHex(byte[] hash) {
        StringBuilder sb = new StringBuilder(hash.length * 2);
        for (byte b : hash) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
