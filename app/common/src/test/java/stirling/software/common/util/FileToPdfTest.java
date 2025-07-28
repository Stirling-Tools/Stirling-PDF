package stirling.software.common.util;

import java.nio.file.Files;

import java.io.IOException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.api.converters.HTMLToPdfRequest;
import stirling.software.common.service.SsrfProtectionService;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@DisplayName("FileToPdf Tests")
class FileToPdfTest {

    private CustomHtmlSanitizer customHtmlSanitizer;

    @BeforeEach
    void setUp() {
        SsrfProtectionService mockSsrfProtectionService = mock(SsrfProtectionService.class);
        stirling.software.common.model.ApplicationProperties mockApplicationProperties = mock(stirling.software.common.model.ApplicationProperties.class);
        stirling.software.common.model.ApplicationProperties.System mockSystem = mock(stirling.software.common.model.ApplicationProperties.System.class);

        when(mockSsrfProtectionService.isUrlAllowed(anyString())).thenReturn(true);
        when(mockApplicationProperties.getSystem()).thenReturn(mockSystem);
        when(mockSystem.getDisableSanitize()).thenReturn(false);

        customHtmlSanitizer = new CustomHtmlSanitizer(mockSsrfProtectionService, mockApplicationProperties);
    }

    @Nested
    @DisplayName("HTML to PDF Conversion Tests")
    class HtmlToPdfConversionTests {
        @Test
        @DisplayName("Throws exception on empty input")
        void testConvertHtmlToPdf() {
            HTMLToPdfRequest request = new HTMLToPdfRequest();
            byte[] fileBytes = new byte[0]; // Sample file bytes (empty input)
            String fileName = "test.html";
            TempFileManager tempFileManager = mock(TempFileManager.class);

            // Mock temp file creation
            try {
                when(tempFileManager.createTempFile(anyString()))
                    .thenReturn(Files.createTempFile("test", ".pdf").toFile())
                    .thenReturn(Files.createTempFile("test", ".html").toFile());
            } catch (IOException e) {
                throw new RuntimeException(e);
            }

            Throwable thrown = assertThrows(
                Exception.class,
                () -> FileToPdf.convertHtmlToPdf("/path/", request, fileBytes, fileName, tempFileManager, customHtmlSanitizer),
                "Should throw exception for empty input or invalid environment"
            );
            assertNotNull(thrown, "Exception should not be null");
        }
    }

    @Nested
    @DisplayName("ZIP Filename Sanitization Tests")
    class ZipFilenameSanitizationTests {

        @Test
        @DisplayName("Returns empty string for null or empty input")
        void testSanitizeZipFilename_NullOrEmpty() {
            assertEquals("", FileToPdf.sanitizeZipFilename(null), "Null input should result in empty string");
            assertEquals("", FileToPdf.sanitizeZipFilename("   "), "Blank input should result in empty string");
        }

        @Test
        @DisplayName("Removes path traversal sequences and normalizes separators")
        void testSanitizeZipFilename_RemovesTraversalSequences() {
            String input = "../some/../path/..\\to\\file.txt";
            String expected = "some/path/to/file.txt";
            assertEquals(expected, FileToPdf.sanitizeZipFilename(input), "Traversal sequences should be removed");
        }

        @Test
        @DisplayName("Removes leading drive letters and slashes")
        void testSanitizeZipFilename_RemovesLeadingDriveAndSlashes() {
            String input = "C:\\folder\\file.txt";
            String expected = "folder/file.txt";
            assertEquals(expected, FileToPdf.sanitizeZipFilename(input), "Leading drive letters should be removed");

            input = "/folder/file.txt";
            expected = "folder/file.txt";
            assertEquals(expected, FileToPdf.sanitizeZipFilename(input), "Leading slash should be removed");
        }

        @Test
        @DisplayName("Leaves safe filenames unchanged")
        void testSanitizeZipFilename_NoChangeForSafeNames() {
            String input = "folder/subfolder/file.txt";
            assertEquals(input, FileToPdf.sanitizeZipFilename(input), "Safe filename should be unchanged");
        }
    }
}
