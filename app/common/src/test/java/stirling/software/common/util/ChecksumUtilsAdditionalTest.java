package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ChecksumUtilsAdditionalTest {

    private static final byte[] HELLO = "hello".getBytes(StandardCharsets.UTF_8);

    @TempDir Path tempDir;

    private Path writeFile(byte[] data) throws IOException {
        Path file = tempDir.resolve("testfile.bin");
        Files.write(file, data);
        return file;
    }

    // --- checksum(Path, String) ---

    @Test
    void testChecksumPath_sha256() throws IOException {
        Path file = writeFile(HELLO);
        String hex = ChecksumUtils.checksum(file, "SHA-256");
        assertEquals("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", hex);
    }

    @Test
    void testChecksumPath_md5() throws IOException {
        Path file = writeFile(HELLO);
        String hex = ChecksumUtils.checksum(file, "MD5");
        assertEquals("5d41402abc4b2a76b9719d911017c592", hex);
    }

    @Test
    void testChecksumPath_crc32() throws IOException {
        Path file = writeFile(HELLO);
        String hex = ChecksumUtils.checksum(file, "CRC32");
        assertEquals("3610a686", hex);
    }

    // --- checksum(InputStream, String) ---

    @Test
    void testChecksumStream_adler32() throws IOException {
        try (InputStream is = new ByteArrayInputStream(HELLO)) {
            String hex = ChecksumUtils.checksum(is, "ADLER32");
            assertNotNull(hex);
            assertEquals(8, hex.length());
        }
    }

    @Test
    void testChecksumStream_sha1() throws IOException {
        try (InputStream is = new ByteArrayInputStream(HELLO)) {
            String hex = ChecksumUtils.checksum(is, "SHA-1");
            assertEquals("aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d", hex);
        }
    }

    @Test
    void testChecksumStream_unsupportedAlgorithm() {
        assertThrows(
                IllegalStateException.class,
                () -> {
                    try (InputStream is = new ByteArrayInputStream(HELLO)) {
                        ChecksumUtils.checksum(is, "FAKE-ALGO");
                    }
                });
    }

    // --- checksumBase64(Path, String) ---

    @Test
    void testChecksumBase64Path_md5() throws IOException {
        Path file = writeFile(HELLO);
        String b64 = ChecksumUtils.checksumBase64(file, "MD5");
        assertEquals("XUFAKrxLKna5cZ2REBfFkg==", b64);
    }

    @Test
    void testChecksumBase64Path_crc32() throws IOException {
        Path file = writeFile(HELLO);
        String b64 = ChecksumUtils.checksumBase64(file, "CRC32");
        assertEquals("NhCmhg==", b64);
    }

    // --- checksumBase64(InputStream, String) ---

    @Test
    void testChecksumBase64Stream_adler32() throws IOException {
        try (InputStream is = new ByteArrayInputStream(HELLO)) {
            String b64 = ChecksumUtils.checksumBase64(is, "ADLER32");
            assertNotNull(b64);
            assertFalse(b64.isEmpty());
        }
    }

    @Test
    void testChecksumBase64Stream_sha256() throws IOException {
        try (InputStream is = new ByteArrayInputStream(HELLO)) {
            String b64 = ChecksumUtils.checksumBase64(is, "SHA-256");
            assertNotNull(b64);
            assertFalse(b64.isEmpty());
        }
    }

    // --- checksums(Path, String...) ---

    @Test
    void testChecksumsPath_multipleAlgorithms() throws IOException {
        Path file = writeFile(HELLO);
        Map<String, String> results = ChecksumUtils.checksums(file, "MD5", "SHA-256", "CRC32");
        assertEquals(3, results.size());
        assertEquals("5d41402abc4b2a76b9719d911017c592", results.get("MD5"));
        assertEquals(
                "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
                results.get("SHA-256"));
        assertEquals("3610a686", results.get("CRC32"));
    }

    @Test
    void testChecksumsPath_preservesOrder() throws IOException {
        Path file = writeFile(HELLO);
        // Digests are output first, then Checksums (CRC32/ADLER32), per implementation
        Map<String, String> results = ChecksumUtils.checksums(file, "MD5", "SHA-1");
        String[] keys = results.keySet().toArray(new String[0]);
        assertEquals("MD5", keys[0]);
        assertEquals("SHA-1", keys[1]);
    }

    @Test
    void testChecksumsStream_unsupportedAlgorithm() {
        assertThrows(
                IllegalStateException.class,
                () -> {
                    try (InputStream is = new ByteArrayInputStream(HELLO)) {
                        ChecksumUtils.checksums(is, "BOGUS");
                    }
                });
    }

    // --- matches(Path, String, String) ---

    @Test
    void testMatchesPath_correctHash() throws IOException {
        Path file = writeFile(HELLO);
        assertTrue(ChecksumUtils.matches(file, "MD5", "5d41402abc4b2a76b9719d911017c592"));
    }

    @Test
    void testMatchesPath_wrongHash() throws IOException {
        Path file = writeFile(HELLO);
        assertFalse(ChecksumUtils.matches(file, "MD5", "0000000000000000000000000000000000"));
    }

    @Test
    void testMatchesPath_caseInsensitive() throws IOException {
        Path file = writeFile(HELLO);
        assertTrue(ChecksumUtils.matches(file, "MD5", "5D41402ABC4B2A76B9719D911017C592"));
    }

    // --- matches(InputStream, String, String) ---

    @Test
    void testMatchesStream_correct() throws IOException {
        try (InputStream is = new ByteArrayInputStream(HELLO)) {
            assertTrue(
                    ChecksumUtils.matches(is, "SHA-1", "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d"));
        }
    }

    @Test
    void testMatchesStream_wrong() throws IOException {
        try (InputStream is = new ByteArrayInputStream(HELLO)) {
            assertFalse(
                    ChecksumUtils.matches(is, "SHA-1", "0000000000000000000000000000000000000000"));
        }
    }

    // --- empty input ---

    @Test
    void testChecksumEmptyInput() throws IOException {
        byte[] empty = new byte[0];
        try (InputStream is = new ByteArrayInputStream(empty)) {
            String hex = ChecksumUtils.checksum(is, "MD5");
            // MD5 of empty input is d41d8cd98f00b204e9800998ecf8427e
            assertEquals("d41d8cd98f00b204e9800998ecf8427e", hex);
        }
    }

    @Test
    void testChecksumCrc32EmptyInput() throws IOException {
        byte[] empty = new byte[0];
        try (InputStream is = new ByteArrayInputStream(empty)) {
            String hex = ChecksumUtils.checksum(is, "CRC32");
            assertEquals("00000000", hex);
        }
    }
}
