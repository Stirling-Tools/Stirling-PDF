package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.awt.image.BufferedImage;
import java.awt.image.RenderedImage;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class PdfUtilsTest {

    @ParameterizedTest
    @CsvSource({"A0", "A1", "A2", "A3", "A4", "A5", "A6", "LETTER", "LEGAL"})
    void textToPageSize_validSizes_returnsCorrectRectangle(String size) {
        PDRectangle result = PdfUtils.textToPageSize(size);
        assertNotNull(result);
        assertTrue(result.getWidth() > 0);
        assertTrue(result.getHeight() > 0);
    }

    @Test
    void textToPageSize_lowercaseA4_returnsA4() {
        PDRectangle result = PdfUtils.textToPageSize("a4");
        assertEquals(PDRectangle.A4.getWidth(), result.getWidth(), 0.01f);
        assertEquals(PDRectangle.A4.getHeight(), result.getHeight(), 0.01f);
    }

    @Test
    void textToPageSize_invalidSize_throwsException() {
        assertThrows(Exception.class, () -> PdfUtils.textToPageSize("INVALID"));
    }

    @Test
    void getAllImages_emptyResources_returnsEmptyList() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            page.setResources(new PDResources());
            doc.addPage(page);
            List<RenderedImage> images = PdfUtils.getAllImages(page.getResources());
            assertTrue(images.isEmpty());
        }
    }

    @Test
    void getAllImages_withImage_returnsImage() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);

            BufferedImage bufferedImage = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
            PDImageXObject pdImage = LosslessFactory.createFromImage(doc, bufferedImage);

            PDResources resources = new PDResources();
            resources.add(pdImage);
            page.setResources(resources);

            List<RenderedImage> images = PdfUtils.getAllImages(page.getResources());
            assertEquals(1, images.size());
        }
    }

    @Test
    void hasImagesOnPage_noImages_returnsFalse() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            page.setResources(new PDResources());
            doc.addPage(page);
            assertFalse(PdfUtils.hasImagesOnPage(page));
        }
    }

    @Test
    void hasTextOnPage_noText_returnsFalse() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            assertFalse(PdfUtils.hasTextOnPage(page, "hello"));
        }
    }

    @Test
    void pageCount_greaterComparator_correct() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            doc.addPage(new PDPage());
            doc.addPage(new PDPage());
            assertTrue(PdfUtils.pageCount(doc, 2, "greater"));
        }
    }

    @Test
    void pageCount_equalComparator_correct() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            doc.addPage(new PDPage());
            assertTrue(PdfUtils.pageCount(doc, 2, "equal"));
        }
    }

    @Test
    void pageCount_lessComparator_correct() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            assertTrue(PdfUtils.pageCount(doc, 5, "less"));
        }
    }

    @Test
    void pageCount_invalidComparator_throwsException() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            assertThrows(Exception.class, () -> PdfUtils.pageCount(doc, 1, "invalid"));
        }
    }

    @Test
    void pageSize_matchingSize_returnsTrue() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            String sizeStr = PDRectangle.A4.getWidth() + "x" + PDRectangle.A4.getHeight();
            assertTrue(PdfUtils.pageSize(doc, sizeStr));
        }
    }

    @Test
    void pageSize_nonMatchingSize_returnsFalse() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            assertFalse(PdfUtils.pageSize(doc, "100x100"));
        }
    }

    // --- hasImages ---

    @Test
    void hasImages_noImages_returnsFalse() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            page.setResources(new PDResources());
            doc.addPage(page);
            assertFalse(PdfUtils.hasImages(doc, "all"));
        }
    }

    @Test
    void hasImages_withImage_returnsTrue() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);

            BufferedImage bufferedImage = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
            PDImageXObject pdImage = LosslessFactory.createFromImage(doc, bufferedImage);
            PDResources resources = new PDResources();
            resources.add(pdImage);
            page.setResources(resources);

            assertTrue(PdfUtils.hasImages(doc, "all"));
        }
    }

    // --- hasText ---

    @Test
    void hasText_noText_returnsFalse() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            assertFalse(PdfUtils.hasText(doc, "all", "hello"));
        }
    }

    // --- textToPageSize additional ---

    @Test
    void textToPageSize_letter_returnsLetter() {
        PDRectangle result = PdfUtils.textToPageSize("letter");
        assertEquals(PDRectangle.LETTER.getWidth(), result.getWidth(), 0.01f);
        assertEquals(PDRectangle.LETTER.getHeight(), result.getHeight(), 0.01f);
    }

    @Test
    void textToPageSize_legal_returnsLegal() {
        PDRectangle result = PdfUtils.textToPageSize("legal");
        assertEquals(PDRectangle.LEGAL.getWidth(), result.getWidth(), 0.01f);
        assertEquals(PDRectangle.LEGAL.getHeight(), result.getHeight(), 0.01f);
    }

    // --- pageCount additional ---

    @Test
    void pageCount_greaterComparator_false() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            assertFalse(PdfUtils.pageCount(doc, 5, "greater"));
        }
    }

    @Test
    void pageCount_equalComparator_false() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            doc.addPage(new PDPage());
            assertFalse(PdfUtils.pageCount(doc, 3, "equal"));
        }
    }

    @Test
    void pageCount_lessComparator_false() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            doc.addPage(new PDPage());
            doc.addPage(new PDPage());
            assertFalse(PdfUtils.pageCount(doc, 2, "less"));
        }
    }

    // --- hasImagesOnPage with image ---

    @Test
    void hasImagesOnPage_withImage_returnsTrue() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);

            BufferedImage bufferedImage = new BufferedImage(5, 5, BufferedImage.TYPE_INT_RGB);
            PDImageXObject pdImage = LosslessFactory.createFromImage(doc, bufferedImage);
            PDResources resources = new PDResources();
            resources.add(pdImage);
            page.setResources(resources);

            assertTrue(PdfUtils.hasImagesOnPage(page));
        }
    }
}
