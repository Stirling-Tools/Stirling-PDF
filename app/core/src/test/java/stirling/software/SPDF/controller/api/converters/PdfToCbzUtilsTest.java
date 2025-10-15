package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.MockitoAnnotations;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.PdfToCbzUtils;

public class PdfToCbzUtilsTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

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
                        () -> {
                            PdfToCbzUtils.convertPdfToCbz(null, 300, pdfDocumentFactory);
                        });
        Assertions.assertEquals("File cannot be null or empty", exception.getMessage());
    }

    @Test
    public void testConvertPdfToCbz_EmptyFile() {
        MockMultipartFile emptyFile =
                new MockMultipartFile("test", "test.pdf", "application/pdf", new byte[0]);

        IllegalArgumentException exception =
                Assertions.assertThrows(
                        IllegalArgumentException.class,
                        () -> {
                            PdfToCbzUtils.convertPdfToCbz(emptyFile, 300, pdfDocumentFactory);
                        });
        Assertions.assertEquals("File cannot be null or empty", exception.getMessage());
    }

    @Test
    public void testConvertPdfToCbz_NonPdfFile() {
        MockMultipartFile nonPdfFile =
                new MockMultipartFile("test", "test.txt", "text/plain", new byte[10]);

        IllegalArgumentException exception =
                Assertions.assertThrows(
                        IllegalArgumentException.class,
                        () -> {
                            PdfToCbzUtils.convertPdfToCbz(nonPdfFile, 300, pdfDocumentFactory);
                        });
        Assertions.assertEquals("File must be a PDF", exception.getMessage());
    }

    @Test
    public void testConvertPdfToCbz_ValidPdf() throws IOException {
        // Create a simple mock PDF
        MockMultipartFile pdfFile =
                new MockMultipartFile("test", "test.pdf", "application/pdf", new byte[100]);

        // Mock the PDF document
        PDDocument mockDocument = Mockito.mock(PDDocument.class);
        Mockito.when(mockDocument.getNumberOfPages()).thenReturn(1);
        Mockito.when(pdfDocumentFactory.load(pdfFile)).thenReturn(mockDocument);

        // structure
        Assertions.assertThrows(
                Exception.class,
                () -> {
                    PdfToCbzUtils.convertPdfToCbz(pdfFile, 300, pdfDocumentFactory);
                });

        // Verify that load was called
        Mockito.verify(pdfDocumentFactory).load(pdfFile);
    }
}
