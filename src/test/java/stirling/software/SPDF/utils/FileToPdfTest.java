package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
public class FileToPdfTest {

    /**
     * Test sanitizeZipFilename with null or empty input. It should return an empty string in these
     * cases.
     */
    @Test
    public void testSanitizeZipFilename_NullOrEmpty() {
        assertEquals("", FileToPdf.sanitizeZipFilename(null));
        assertEquals("", FileToPdf.sanitizeZipFilename("   "));
    }

    /**
     * Test sanitizeZipFilename to ensure it removes path traversal sequences. This includes
     * removing both forward and backward slash sequences.
     */
    @Test
    public void testSanitizeZipFilename_RemovesTraversalSequences() {
        String input = "../some/../path/..\\to\\file.txt";
        String expected = "some/path/to/file.txt";

        // Expect that the method replaces backslashes with forward slashes
        // and removes path traversal sequences
        assertEquals(expected, FileToPdf.sanitizeZipFilename(input));
    }

    /** Test sanitizeZipFilename to ensure that it removes leading drive letters and slashes. */
    @Test
    public void testSanitizeZipFilename_RemovesLeadingDriveAndSlashes() {
        String input = "C:\\folder\\file.txt";
        String expected = "folder/file.txt";
        assertEquals(expected, FileToPdf.sanitizeZipFilename(input));

        input = "/folder/file.txt";
        expected = "folder/file.txt";
        assertEquals(expected, FileToPdf.sanitizeZipFilename(input));
    }

    /** Test sanitizeZipFilename to verify that safe filenames remain unchanged. */
    @Test
    public void testSanitizeZipFilename_NoChangeForSafeNames() {
        String input = "folder/subfolder/file.txt";
        assertEquals(input, FileToPdf.sanitizeZipFilename(input));
    }
}
