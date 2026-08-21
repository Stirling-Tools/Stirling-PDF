package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class FileToPdfTest {

    @Test
    void testSanitizeZipFilename_normalFilename() {
        String result = FileToPdf.sanitizeZipFilename("document.html");
        assertEquals("document.html", result);
    }

    @Test
    void testSanitizeZipFilename_pathTraversal() {
        String result = FileToPdf.sanitizeZipFilename("../../etc/passwd");
        // Should remove ../ sequences
        assertFalse(result.contains(".."), "Path traversal sequences should be removed");
    }

    @Test
    void testSanitizeZipFilename_driveLetterRemoved() {
        String result = FileToPdf.sanitizeZipFilename("C:\\Users\\test\\file.html");
        assertFalse(result.startsWith("C:"), "Drive letter should be removed");
    }

    @Test
    void testSanitizeZipFilename_backslashesNormalized() {
        String result = FileToPdf.sanitizeZipFilename("path\\to\\file.html");
        assertFalse(result.contains("\\"), "Backslashes should be normalized to forward slashes");
        assertTrue(result.contains("/") || !result.contains("\\"));
    }

    @Test
    void testSanitizeZipFilename_nullInput() {
        String result = FileToPdf.sanitizeZipFilename(null);
        assertEquals("", result, "Null input should return empty string");
    }

    @Test
    void testSanitizeZipFilename_emptyInput() {
        String result = FileToPdf.sanitizeZipFilename("");
        assertEquals("", result, "Empty input should return empty string");
    }

    @Test
    void testSanitizeZipFilename_whitespaceOnly() {
        String result = FileToPdf.sanitizeZipFilename("   ");
        assertEquals("", result, "Whitespace-only input should return empty string");
    }

    @Test
    void testSanitizeZipFilename_leadingSlashes() {
        String result = FileToPdf.sanitizeZipFilename("///path/to/file.html");
        assertFalse(result.startsWith("/"), "Leading slashes should be removed");
    }

    @Test
    void testSanitizeZipFilename_nestedDirectories() {
        String result = FileToPdf.sanitizeZipFilename("dir1/dir2/file.html");
        assertEquals("dir1/dir2/file.html", result, "Normal nested paths should be preserved");
    }

    @Test
    void testSanitizeZipFilename_mixedTraversal() {
        String result = FileToPdf.sanitizeZipFilename("dir/../../../etc/passwd");
        assertFalse(result.contains(".."), "Mixed path traversal should be removed");
    }

    @Test
    void testSanitizeZipFilename_backslashTraversal() {
        String result = FileToPdf.sanitizeZipFilename("dir\\..\\..\\etc\\passwd");
        assertFalse(result.contains(".."), "Backslash path traversal should be removed");
    }
}
