package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.junit.jupiter.api.Test;

public class ChecksumUtilsTest {

    @Test
    void computeChecksums_basic() throws Exception {
        byte[] data = "hello".getBytes(StandardCharsets.UTF_8);

        // MD5 (hex)
        try (InputStream is = new ByteArrayInputStream(data)) {
            assertEquals("5d41402abc4b2a76b9719d911017c592", ChecksumUtils.checksum(is, "MD5"));
        }

        // MD5 (Base64)
        try (InputStream is = new ByteArrayInputStream(data)) {
            assertEquals("XUFAKrxLKna5cZ2REBfFkg==", ChecksumUtils.checksumBase64(is, "MD5"));
        }

        // MD5 + CRC32 (hex map)
        try (InputStream is = new ByteArrayInputStream(data)) {
            Map<String, String> map = ChecksumUtils.checksums(is, "MD5", "CRC32");
            assertEquals("5d41402abc4b2a76b9719d911017c592", map.get("MD5"));
            assertEquals("3610a686", map.get("CRC32"));
        }
    }

    @Test
    void crc32_base64_bigEndianBytes_forHello() throws Exception {
        // CRC32("hello") = 0x3610A686 → bytes: 36 10 A6 86 → Base64: "NhCmhg=="
        byte[] data = "hello".getBytes(StandardCharsets.UTF_8);
        try (InputStream is = new ByteArrayInputStream(data)) {
            assertEquals("NhCmhg==", ChecksumUtils.checksumBase64(is, "CRC32"));
        }
    }

    @Test
    void crc32_unsignedFormatting_highBitSet() throws Exception {
        // CRC32 of single zero byte (0x00) is 0xD202EF8D (>= 0x8000_0000)
        byte[] data = {0x00};

        // Hex (unsigned, 8 chars, lowercase)
        try (InputStream is = new ByteArrayInputStream(data)) {
            assertEquals("d202ef8d", ChecksumUtils.checksum(is, "CRC32"));
        }

        // Base64 of the 4-byte big-endian representation
        try (InputStream is = new ByteArrayInputStream(data)) {
            assertEquals("0gLvjQ==", ChecksumUtils.checksumBase64(is, "CRC32"));
        }

        // matches(..) must be case-insensitive for hex
        try (InputStream is = new ByteArrayInputStream("hello".getBytes(StandardCharsets.UTF_8))) {
            assertTrue(ChecksumUtils.matches(is, "CRC32", "3610A686")); // uppercase expected
        }
    }
}
