package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.junit.jupiter.api.Test;

public class ChecksumUtilsTest {

    @Test
    void computeChecksums() throws Exception {
        byte[] data = "hello".getBytes(StandardCharsets.UTF_8);
        try (InputStream is = new ByteArrayInputStream(data)) {
            assertEquals("5d41402abc4b2a76b9719d911017c592", ChecksumUtils.checksum(is, "MD5"));
        }
        try (InputStream is = new ByteArrayInputStream(data)) {
            assertEquals("XUFAKrxLKna5cZ2REBfFkg==", ChecksumUtils.checksumBase64(is, "MD5"));
        }
        try (InputStream is = new ByteArrayInputStream(data)) {
            Map<String, String> map = ChecksumUtils.checksums(is, "MD5", "CRC32");
            assertEquals("5d41402abc4b2a76b9719d911017c592", map.get("MD5"));
            assertEquals("3610a686", map.get("CRC32"));
        }
    }
}
