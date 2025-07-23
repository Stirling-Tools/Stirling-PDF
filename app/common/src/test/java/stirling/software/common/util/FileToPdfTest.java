package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;


import java.io.File;
import java.io.IOException;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.api.converters.HTMLToPdfRequest;

@DisplayName("FileToPdf Tests")
public class FileToPdfTest {

    @Test
    @DisplayName("Throws exception when converting empty HTML content to PDF")
    public void testConvertHtmlToPdf() {
        HTMLToPdfRequest request = new HTMLToPdfRequest();
        byte[] fileBytes = new byte[0]; // empty input
        String fileName = "test.html"; // html file name
        boolean disableSanitize = false;
        TempFileManager tempFileManager = mock(TempFileManager.class);

        try {
            when(tempFileManager.createTempFile(anyString()))
                .thenReturn(File.createTempFile("test", ".pdf"))
                .thenReturn(File.createTempFile("test", ".html"));
        } catch (IOException e) {
            throw new RuntimeException(e);
        }

        Throwable thrown =
            assertThrows(
                Exception.class,
                () -> FileToPdf.convertHtmlToPdf(
                    "/path/", request, fileBytes, fileName, disableSanitize, tempFileManager),
                "Should throw exception for empty HTML content");

        assertNotNull(thrown, "Thrown exception should not be null");
    }

    @Nested
    @DisplayName("sanitizeZipFilename Tests")
    class SanitizeZipFilenameTests {

        @Test
        @DisplayName("Returns empty string for null or blank input")
        public void testSanitizeZipFilename_NullOrEmpty() {
            assertEquals("", FileToPdf.sanitizeZipFilename(null), "Null input should return empty string");
            assertEquals("", FileToPdf.sanitizeZipFilename("   "), "Blank input should return empty string");
        }

        @Test
        @DisplayName("Removes path traversal sequences and normalizes slashes")
        public void testSanitizeZipFilename_RemovesTraversalSequences() {
            String input = "../some/../path/..\\to\\file.txt";
            String expected = "some/path/to/file.txt";

            assertEquals(expected, FileToPdf.sanitizeZipFilename(input), "Should remove traversal and normalize slashes");
        }

        @Test
        @DisplayName("Removes leading drive letters and starting slashes")
        public void testSanitizeZipFilename_RemovesLeadingDriveAndSlashes() {
            String input = "C:\\folder\\file.txt";
            String expected = "folder/file.txt";
            assertEquals(expected, FileToPdf.sanitizeZipFilename(input), "Should remove drive letter and normalize slashes");

            input = "/folder/file.txt";
            expected = "folder/file.txt";
            assertEquals(expected, FileToPdf.sanitizeZipFilename(input), "Should remove leading slash");
        }

        @Test
        @DisplayName("Leaves safe filenames unchanged")
        public void testSanitizeZipFilename_NoChangeForSafeNames() {
            String input = "folder/subfolder/file.txt";
            assertEquals(input, FileToPdf.sanitizeZipFilename(input), "Safe filename should remain unchanged");
        }
    }
}
