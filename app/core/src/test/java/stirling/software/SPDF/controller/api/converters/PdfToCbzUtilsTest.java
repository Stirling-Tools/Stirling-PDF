package stirling.software.SPDF.controller.api.converters;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.PdfToCbzUtils;
import stirling.software.common.util.TempFileManager;

public class PdfToCbzUtilsTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @BeforeEach
    public void setUp() {
        MockitoAnnotations.openMocks(this);
    }

    @Test
    public void testIsPdfFile() {
        MockMultipartFile pdfFile =
                new MockMultipartFile("test", "test.pdf", "application/pdf", new byte[10]);
        MockMultipartFile nonPdfFile =
                new MockMultipartFile("test", "test.txt", "text/plain", new byte[10]);
        MockMultipartFile noNameFile =
                new MockMultipartFile("test", null, "application/pdf", new byte[10]);

        Assertions.assertTrue(PdfToCbzUtils.isPdfFile(pdfFile));
        Assertions.assertFalse(PdfToCbzUtils.isPdfFile(nonPdfFile));
        Assertions.assertFalse(PdfToCbzUtils.isPdfFile(noNameFile));
    }

    @Test
    public void testConvertPdfToCbz_NullFile() {
        IllegalArgumentException exception =
                Assertions.assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                PdfToCbzUtils.convertPdfToCbz(
                                        null, 300, pdfDocumentFactory, tempFileManager));
        Assertions.assertEquals("File cannot be null or empty", exception.getMessage());
    }

    @Test
    public void testConvertPdfToCbz_EmptyFile() {
        MockMultipartFile emptyFile =
                new MockMultipartFile("test", "test.pdf", "application/pdf", new byte[0]);

        IllegalArgumentException exception =
                Assertions.assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                PdfToCbzUtils.convertPdfToCbz(
                                        emptyFile, 300, pdfDocumentFactory, tempFileManager));
        Assertions.assertEquals("File cannot be null or empty", exception.getMessage());
    }

    @Test
    public void testConvertPdfToCbz_NonPdfFile() {
        MockMultipartFile nonPdfFile =
                new MockMultipartFile("test", "test.txt", "text/plain", new byte[10]);

        IllegalArgumentException exception =
                Assertions.assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                PdfToCbzUtils.convertPdfToCbz(
                                        nonPdfFile, 300, pdfDocumentFactory, tempFileManager));
        Assertions.assertEquals("File must be in PDF format", exception.getMessage());
    }

    @Test
    public void testConvertPdfToCbz_InvalidPdfBytes() {
        // Create a simple mock file with invalid PDF bytes
        MockMultipartFile pdfFile =
                new MockMultipartFile("test", "test.pdf", "application/pdf", new byte[100]);

        // Expect exception when attempting to process invalid bytes with JPDFium
        Assertions.assertThrows(
                Exception.class,
                () ->
                        PdfToCbzUtils.convertPdfToCbz(
                                pdfFile, 300, pdfDocumentFactory, tempFileManager));
    }
}
