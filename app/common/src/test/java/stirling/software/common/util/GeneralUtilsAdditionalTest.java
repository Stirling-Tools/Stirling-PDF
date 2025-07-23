package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

@DisplayName("GeneralUtils Additional Tests")
class GeneralUtilsAdditionalTest {

    @Nested
    @DisplayName("Size Conversion Tests")
    class SizeConversionTests {

        @Test
        @DisplayName("convertSizeToBytes parses valid size strings to bytes correctly")
        void testConvertSizeToBytes_ValidInputs() {
            assertEquals(1024L, GeneralUtils.convertSizeToBytes("1KB"), "1KB should convert to 1024 bytes");
            assertEquals(1024L * 1024, GeneralUtils.convertSizeToBytes("1MB"), "1MB should convert to 1048576 bytes");
            assertEquals(1024L * 1024 * 1024, GeneralUtils.convertSizeToBytes("1GB"), "1GB should convert to 1073741824 bytes");
            assertEquals(100L * 1024 * 1024, GeneralUtils.convertSizeToBytes("100"), "100 should convert to 104857600 bytes");
        }

        @ParameterizedTest
        @ValueSource(strings = {"invalid", ""})
        @NullSource
        @DisplayName("convertSizeToBytes returns null for invalid or null inputs")
        void testConvertSizeToBytes_InvalidInputs(String input) {
            assertNull(GeneralUtils.convertSizeToBytes(input), "Invalid input should return null");
        }
    }

    @Nested
    @DisplayName("Byte Formatting Tests")
    class ByteFormattingTests {

        @Test
        @DisplayName("formatBytes returns human-readable strings for various byte sizes")
        void testFormatBytes() {
            assertEquals("512 B", GeneralUtils.formatBytes(512), "512 bytes should format as '512 B'");
            assertEquals("1.00 KB", GeneralUtils.formatBytes(1024), "1024 bytes should format as '1.00 KB'");
            assertEquals("1.00 MB", GeneralUtils.formatBytes(1024L * 1024), "1048576 bytes should format as '1.00 MB'");
            assertEquals("1.00 GB", GeneralUtils.formatBytes(1024L * 1024 * 1024), "1073741824 bytes should format as '1.00 GB'");
        }
    }

    @Nested
    @DisplayName("URL and UUID Validation Tests")
    class ValidationTests {

        @Test
        @DisplayName("isValidURL returns true for valid URLs and false for invalid ones")
        void testIsValidURL() {
            assertTrue(GeneralUtils.isValidURL("https://example.com"), "Valid HTTPS URL should return true");
            assertFalse(GeneralUtils.isValidURL("htp:/bad"), "Invalid protocol should return false");
        }

        @Test
        @DisplayName("isURLReachable returns false for unreachable or invalid URLs")
        void testIsURLReachable() {
            assertFalse(GeneralUtils.isURLReachable("http://localhost"), "Localhost should not be reachable");
            assertFalse(GeneralUtils.isURLReachable("ftp://example.com"), "FTP protocol should not be reachable");
        }

        @Test
        @DisplayName("isValidUUID returns true for valid UUIDs and false for invalid ones")
        void testIsValidUUID() {
            assertTrue(GeneralUtils.isValidUUID("123e4567-e89b-12d3-a456-426614174000"), "Valid UUID should return true");
            assertFalse(GeneralUtils.isValidUUID("not-a-uuid"), "Invalid UUID should return false");
        }

        @Test
        @DisplayName("isVersionHigher compares versions correctly")
        void testIsVersionHigher() {
            assertFalse(GeneralUtils.isVersionHigher(null, "1.0"), "Null version should return false");
            assertTrue(GeneralUtils.isVersionHigher("2.0", "1.9"), "Higher version should return true");
            assertFalse(GeneralUtils.isVersionHigher("1.0", "1.0.1"), "Lower version should return false");
        }
    }
}
