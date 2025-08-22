package stirling.software.common.util;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.Adler32;
import java.util.zip.CRC32;
import java.util.zip.Checksum;

import lombok.NoArgsConstructor;

@NoArgsConstructor
public class ChecksumUtils {

    public static String checksum(Path path, String algorithm) throws IOException {
        try (InputStream is = Files.newInputStream(path)) {
            return checksum(is, algorithm);
        }
    }

    public static String checksum(InputStream is, String algorithm) throws IOException {
        switch (algorithm.toUpperCase()) {
            case "CRC32":
                return checksumChecksum(is, new CRC32());
            case "ADLER32":
                return checksumChecksum(is, new Adler32());
            default:
                return toHex(checksumBytes(is, algorithm));
        }
    }

    public static String checksumBase64(Path path, String algorithm) throws IOException {
        try (InputStream is = Files.newInputStream(path)) {
            return checksumBase64(is, algorithm);
        }
    }

    public static String checksumBase64(InputStream is, String algorithm) throws IOException {
        switch (algorithm.toUpperCase()) {
            case "CRC32":
                return Base64.getEncoder().encodeToString(checksumChecksumBytes(is, new CRC32()));
            case "ADLER32":
                return Base64.getEncoder().encodeToString(checksumChecksumBytes(is, new Adler32()));
            default:
                return Base64.getEncoder().encodeToString(checksumBytes(is, algorithm));
        }
    }

    public static Map<String, String> checksums(Path path, String... algorithms)
            throws IOException {
        try (InputStream is = Files.newInputStream(path)) {
            return checksums(is, algorithms);
        }
    }

    public static Map<String, String> checksums(InputStream is, String... algorithms)
            throws IOException {
        Map<String, MessageDigest> digests = new LinkedHashMap<>();
        Map<String, Checksum> checksums = new LinkedHashMap<>();
        for (String algorithm : algorithms) {
            switch (algorithm.toUpperCase()) {
                case "CRC32":
                    checksums.put(algorithm, new CRC32());
                    break;
                case "ADLER32":
                    checksums.put(algorithm, new Adler32());
                    break;
                default:
                    try {
                        digests.put(algorithm, MessageDigest.getInstance(algorithm));
                    } catch (NoSuchAlgorithmException e) {
                        throw new IllegalStateException("Unsupported algorithm: " + algorithm, e);
                    }
            }
        }

        byte[] buffer = new byte[8192];
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
            results.put(entry.getKey(), String.format("%08x", entry.getValue().getValue()));
        }
        return results;
    }

    public static boolean matches(Path path, String algorithm, String expected) throws IOException {
        try (InputStream is = Files.newInputStream(path)) {
            return matches(is, algorithm, expected);
        }
    }

    public static boolean matches(InputStream is, String algorithm, String expected)
            throws IOException {
        return checksum(is, algorithm).equalsIgnoreCase(expected);
    }

    private static byte[] checksumBytes(InputStream is, String algorithm) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance(algorithm);
            byte[] buffer = new byte[8192];
            int read;
            while ((read = is.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
            return digest.digest();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("Unsupported algorithm: " + algorithm, e);
        }
    }

    private static String checksumChecksum(InputStream is, Checksum checksum) throws IOException {
        byte[] buffer = new byte[8192];
        int read;
        while ((read = is.read(buffer)) != -1) {
            checksum.update(buffer, 0, read);
        }
        return String.format("%08x", checksum.getValue());
    }

    private static byte[] checksumChecksumBytes(InputStream is, Checksum checksum)
            throws IOException {
        byte[] buffer = new byte[8192];
        int read;
        while ((read = is.read(buffer)) != -1) {
            checksum.update(buffer, 0, read);
        }
        return ByteBuffer.allocate(4).putInt((int) checksum.getValue()).array();
    }

    private static String toHex(byte[] hash) {
        StringBuilder sb = new StringBuilder();
        for (byte b : hash) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
