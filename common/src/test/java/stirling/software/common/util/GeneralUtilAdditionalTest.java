package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class GeneralUtilAdditionalTest {

    @Test
    void testConvertSizeToBytes() {
        assertEquals(1024L, GeneralUtil.convertSizeToBytes("1KB"));
        assertEquals(1024L * 1024, GeneralUtil.convertSizeToBytes("1MB"));
        assertEquals(1024L * 1024 * 1024, GeneralUtil.convertSizeToBytes("1GB"));
        assertEquals(100L * 1024 * 1024, GeneralUtil.convertSizeToBytes("100"));
        assertNull(GeneralUtil.convertSizeToBytes("invalid"));
        assertNull(GeneralUtil.convertSizeToBytes(null));
    }

    @Test
    void testFormatBytes() {
        assertEquals("512 B", GeneralUtil.formatBytes(512));
        assertEquals("1.00 KB", GeneralUtil.formatBytes(1024));
        assertEquals("1.00 MB", GeneralUtil.formatBytes(1024L * 1024));
        assertEquals("1.00 GB", GeneralUtil.formatBytes(1024L * 1024 * 1024));
    }

    @Test
    void testURLHelpersAndUUID() {
        assertTrue(GeneralUtil.isValidURL("https://example.com"));
        assertFalse(GeneralUtil.isValidURL("htp:/bad"));
        assertFalse(GeneralUtil.isURLReachable("http://localhost"));
        assertFalse(GeneralUtil.isURLReachable("ftp://example.com"));

        assertTrue(GeneralUtil.isValidUUID("123e4567-e89b-12d3-a456-426614174000"));
        assertFalse(GeneralUtil.isValidUUID("not-a-uuid"));

        assertFalse(GeneralUtil.isVersionHigher(null, "1.0"));
        assertTrue(GeneralUtil.isVersionHigher("2.0", "1.9"));
        assertFalse(GeneralUtil.isVersionHigher("1.0", "1.0.1"));
    }
}
