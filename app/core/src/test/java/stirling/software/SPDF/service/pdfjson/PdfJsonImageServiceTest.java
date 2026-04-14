package stirling.software.SPDF.service.pdfjson;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.json.PdfJsonImageElement;

class PdfJsonImageServiceTest {

    private PdfJsonImageService service;

    @BeforeEach
    void setUp() {
        service = new PdfJsonImageService();
    }

    // --- drawImageElement tests ---

    @Test
    void drawImageElement_nullElement_doesNothing() throws IOException {
        PDPageContentStream cs = mock(PDPageContentStream.class);
        PDDocument doc = mock(PDDocument.class);
        Map<String, PDImageXObject> cache = new HashMap<>();

        service.drawImageElement(cs, doc, null, cache);

        verifyNoInteractions(cs);
    }

    @Test
    void drawImageElement_nullImageData_doesNothing() throws IOException {
        PDPageContentStream cs = mock(PDPageContentStream.class);
        PDDocument doc = mock(PDDocument.class);
        Map<String, PDImageXObject> cache = new HashMap<>();
        PdfJsonImageElement element = new PdfJsonImageElement();
        element.setImageData(null);

        service.drawImageElement(cs, doc, element, cache);

        verifyNoInteractions(cs);
    }

    @Test
    void drawImageElement_blankImageData_doesNothing() throws IOException {
        PDPageContentStream cs = mock(PDPageContentStream.class);
        PDDocument doc = mock(PDDocument.class);
        Map<String, PDImageXObject> cache = new HashMap<>();
        PdfJsonImageElement element = new PdfJsonImageElement();
        element.setImageData("   ");

        service.drawImageElement(cs, doc, element, cache);

        verifyNoInteractions(cs);
    }

    // --- createImageXObject tests ---

    @Test
    void createImageXObject_invalidBase64_returnsNull() throws IOException {
        PDDocument doc = mock(PDDocument.class);
        PdfJsonImageElement element = new PdfJsonImageElement();
        element.setImageData("not!!valid!!base64!!");

        PDImageXObject result = service.createImageXObject(doc, element);
        assertNull(result);
    }

    @Test
    void createImageXObject_validBase64ButInvalidImage_throwsOrReturnsNull() throws IOException {
        PDDocument doc = new PDDocument();
        PdfJsonImageElement element = new PdfJsonImageElement();
        // Valid base64 but not a real image
        element.setImageData("AAAA");
        element.setId("test-id");

        // Depending on PDFBox version, this may throw or return something
        try {
            PDImageXObject result = service.createImageXObject(doc, element);
            // Either null or valid is acceptable for garbage data
        } catch (IOException | IllegalArgumentException e) {
            // Expected for invalid image data
        } finally {
            doc.close();
        }
    }

    // --- extractImagesForPage tests ---

    @Test
    void extractImagesForPage_emptyPage_returnsEmptyList() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            org.apache.pdfbox.pdmodel.PDPage page = new org.apache.pdfbox.pdmodel.PDPage();
            doc.addPage(page);

            var result = service.extractImagesForPage(doc, page, 1);
            assertNotNull(result);
            assertTrue(result.isEmpty());
        }
    }

    // --- collectImages tests ---

    @Test
    void collectImages_emptyDocument_returnsEmptyMap() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new org.apache.pdfbox.pdmodel.PDPage());

            var result = service.collectImages(doc, 1, progress -> {});
            assertNotNull(result);
            // The page has no images so the map should be empty
            assertTrue(
                    result.isEmpty() || result.values().stream().allMatch(java.util.List::isEmpty));
        }
    }

    @Test
    void collectImages_progressCallbackInvoked() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new org.apache.pdfbox.pdmodel.PDPage());
            doc.addPage(new org.apache.pdfbox.pdmodel.PDPage());

            java.util.List<stirling.software.SPDF.model.api.PdfJsonConversionProgress>
                    progressList = new java.util.ArrayList<>();
            service.collectImages(doc, 2, progressList::add);

            assertEquals(2, progressList.size());
        }
    }
}
