package stirling.software.common.util;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.MockitoAnnotations;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;

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
                        () -> PdfToCbzUtils.convertPdfToCbz(null, 300, pdfDocumentFactory));
        Assertions.assertEquals("File cannot be null or empty", exception.getMessage());
    }

    @Test
    public void testConvertPdfToCbz_EmptyFile() {
        MockMultipartFile emptyFile =
                new MockMultipartFile("test", "test.pdf", "application/pdf", new byte[0]);

        IllegalArgumentException exception =
                Assertions.assertThrows(
                        IllegalArgumentException.class,
                        () -> PdfToCbzUtils.convertPdfToCbz(emptyFile, 300, pdfDocumentFactory));
        Assertions.assertEquals("File cannot be null or empty", exception.getMessage());
    }

    @Test
    public void testConvertPdfToCbz_NonPdfFile() {
        MockMultipartFile nonPdfFile =
                new MockMultipartFile("test", "test.txt", "text/plain", new byte[10]);

        IllegalArgumentException exception =
                Assertions.assertThrows(
                        IllegalArgumentException.class,
                        () -> PdfToCbzUtils.convertPdfToCbz(nonPdfFile, 300, pdfDocumentFactory));
        Assertions.assertEquals("File must be a PDF", exception.getMessage());
    }

    @Test
    public void testConvertPdfToCbz_ValidPdf() throws IOException {
        // Create a simple mock PDF
        MockMultipartFile pdfFile =
                new MockMultipartFile("test", "test.pdf", "application/pdf", new byte[] {1, 2, 3});

        // Mock the PDF document
        PDDocument document = new PDDocument();
        document.addPage(new PDPage());
        Mockito.when(pdfDocumentFactory.load(pdfFile)).thenReturn(document);

        byte[] cbzBytes = PdfToCbzUtils.convertPdfToCbz(pdfFile, 150, pdfDocumentFactory);

        try (ZipInputStream zipInputStream =
                new ZipInputStream(new ByteArrayInputStream(cbzBytes))) {
            ZipEntry entry = zipInputStream.getNextEntry();
            Assertions.assertNotNull(entry);
            Assertions.assertEquals("page_001.png", entry.getName());

            ByteArrayOutputStream imageData = new ByteArrayOutputStream();
            zipInputStream.transferTo(imageData);
            Assertions.assertTrue(imageData.size() > 0);

            Assertions.assertNull(zipInputStream.getNextEntry());
        }

        Mockito.verify(pdfDocumentFactory).load(pdfFile);
    }

    @Test
    public void testConvertPdfToCbz_PdfWithoutPages() throws IOException {
        MockMultipartFile pdfFile =
                new MockMultipartFile("test", "test.pdf", "application/pdf", new byte[] {1});

        PDDocument emptyDocument = new PDDocument();
        Mockito.when(pdfDocumentFactory.load(pdfFile)).thenReturn(emptyDocument);

        IllegalArgumentException exception =
                Assertions.assertThrows(
                        IllegalArgumentException.class,
                        () -> PdfToCbzUtils.convertPdfToCbz(pdfFile, 150, pdfDocumentFactory));

        Assertions.assertEquals("PDF file contains no pages", exception.getMessage());

        // Verify that load was called
        Mockito.verify(pdfDocumentFactory).load(pdfFile);
    }
}
