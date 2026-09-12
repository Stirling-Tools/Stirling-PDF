package stirling.software.common.util;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

class PDFPageCounterTest {

    private static byte[] buildPdf(int pageCount) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < pageCount; i++) {
                doc.addPage(new PDPage());
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    @Test
    void pageCount_singlePagePdf_returnsOne() throws IOException {
        byte[] pdfBytes = buildPdf(1);
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            assertEquals(1, doc.getNumberOfPages(),
                    "A 1 page PDF must be exactly 1 page");
        }
    }

    @Test
    void pageCount_multiPagePdf_returnsCorrectCount() throws IOException {
        byte[] pdfBytes = buildPdf(5);
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            assertEquals(5, doc.getNumberOfPages(),
                    "A 5 page PDF must be exactly 5 pages");
        }
    }

    @Test
    void pageCount_largeDocument_returnsCorrectCount() throws IOException {
        byte[] pdfBytes = buildPdf(100);
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            assertEquals(100, doc.getNumberOfPages(),
                    "A 100 page PDF must be exactly 100 pages");
        }
    }

    @Test
    void pageCount_nonPdf_throwsException() {
        byte[] junk = "This is not a PDF".getBytes();
        assertThrows(Exception.class,
                () -> Loader.loadPDF(junk),
                "Non-PDF bytes must throw, not return 0 pages");
    }
}