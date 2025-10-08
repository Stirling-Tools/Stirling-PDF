package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class GeneralUtilsAdditionalTest {

    @Test
    void testConvertSizeToBytes() {
        assertEquals(1024L, GeneralUtils.convertSizeToBytes("1KB"));
        assertEquals(1024L * 1024, GeneralUtils.convertSizeToBytes("1MB"));
        assertEquals(1024L * 1024 * 1024, GeneralUtils.convertSizeToBytes("1GB"));
        assertEquals(100L * 1024 * 1024, GeneralUtils.convertSizeToBytes("100"));
        assertNull(GeneralUtils.convertSizeToBytes("invalid"));
        assertNull(GeneralUtils.convertSizeToBytes(null));
    }

    @Test
    void testFormatBytes() {
        assertEquals("512 B", GeneralUtils.formatBytes(512));
        assertEquals("1.00 KB", GeneralUtils.formatBytes(1024));
        assertEquals("1.00 MB", GeneralUtils.formatBytes(1024L * 1024));
        assertEquals("1.00 GB", GeneralUtils.formatBytes(1024L * 1024 * 1024));
    }

    @Test
    void testURLHelpersAndUUID() {
        assertTrue(GeneralUtils.isValidURL("https://example.com"));
        assertFalse(GeneralUtils.isValidURL("htp:/bad"));
        assertFalse(GeneralUtils.isURLReachable("http://localhost"));
        assertFalse(GeneralUtils.isURLReachable("http://0.0.0.0"));
        assertFalse(GeneralUtils.isURLReachable("http://192.168.1.1"));
        assertFalse(GeneralUtils.isURLReachable("http://169.254.0.1"));
        assertFalse(GeneralUtils.isURLReachable("http://172.16.0.1"));
        assertFalse(GeneralUtils.isURLReachable("http://192.0.2.1"));
        assertFalse(GeneralUtils.isURLReachable("http://192.0.0.0"));
        assertFalse(GeneralUtils.isURLReachable("http://192.168.0.0"));
        assertFalse(GeneralUtils.isURLReachable("http://198.18.0.1"));
        assertFalse(GeneralUtils.isURLReachable("http://198.51.100.0"));
        assertFalse(GeneralUtils.isURLReachable("http://203.0.113.0"));
        assertFalse(GeneralUtils.isURLReachable("http://10.0.0.0"));
        assertFalse(GeneralUtils.isURLReachable("http://100.64.0.1"));
        assertFalse(GeneralUtils.isURLReachable("http://224.0.0.0"));
        assertFalse(GeneralUtils.isURLReachable("http://[::ffff:127.0.0.1]/"));
        assertFalse(GeneralUtils.isURLReachable("http://[fd12:3456:789a::1]/"));
        assertFalse(GeneralUtils.isURLReachable("ftp://example.com"));

        assertTrue(GeneralUtils.isValidUUID("123e4567-e89b-12d3-a456-426614174000"));
        assertFalse(GeneralUtils.isValidUUID("not-a-uuid"));

        assertFalse(GeneralUtils.isVersionHigher(null, "1.0"));
        assertTrue(GeneralUtils.isVersionHigher("2.0", "1.9"));
        assertFalse(GeneralUtils.isVersionHigher("1.0", "1.0.1"));
    }
}
