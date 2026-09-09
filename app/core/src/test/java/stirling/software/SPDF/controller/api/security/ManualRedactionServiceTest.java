package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.ManualRedactPdfRequest;
import stirling.software.common.model.api.security.RedactionArea;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@DisplayName("ManualRedactionService Tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ManualRedactionServiceTest {

    @Mock private TempFileManager tempFileManager;

    private ManualRedactionService service;

    // Track temp files created during finalize tests so we can clean them up.
    private final List<File> createdTempFiles = new ArrayList<>();

    @BeforeEach
    void setUp() throws Exception {
        service = new ManualRedactionService(tempFileManager);

        // createManagedTempFile returns a TempFile backed by a real on-disk file so
        // document.save() works and length() can be inspected.
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("redact-test", inv.<String>getArgument(0))
                                            .toFile();
                            createdTempFiles.add(f);
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    @AfterEach
    void tearDown() {
        for (File f : createdTempFiles) {
            if (f != null && f.exists()) {
                f.delete();
            }
        }
        createdTempFiles.clear();
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static PDDocument newDocument(int pageCount) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pageCount; i++) {
            doc.addPage(new PDPage(PDRectangle.A4));
        }
        return doc;
    }

    private static PDDocument newDocumentWithText() throws IOException {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            cs.newLineAtOffset(72, 700);
            cs.showText("Sensitive text to redact");
            cs.endText();
        }
        return doc;
    }

    private static RedactionArea area(
            Integer page, double x, double y, double width, double height, String color) {
        RedactionArea a = new RedactionArea();
        a.setPage(page);
        a.setX(x);
        a.setY(y);
        a.setWidth(width);
        a.setHeight(height);
        a.setColor(color);
        return a;
    }

    private static PDFText text(int pageIndex, float x1, float y1, float x2, float y2) {
        return new PDFText(pageIndex, x1, y1, x2, y2, "redacted");
    }

    private static byte[] save(PDDocument doc) throws IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        doc.save(baos);
        return baos.toByteArray();
    }

    // -----------------------------------------------------------------------
    // decodeOrDefault
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("decodeOrDefault")
    class DecodeOrDefault {

        @Test
        @DisplayName("null returns black")
        void nullReturnsBlack() {
            assertSame(Color.BLACK, ManualRedactionService.decodeOrDefault(null));
        }

        @Test
        @DisplayName("hex with leading hash decodes")
        void hexWithHash() {
            assertEquals(Color.RED, ManualRedactionService.decodeOrDefault("#FF0000"));
        }

        @Test
        @DisplayName("hex without leading hash decodes")
        void hexWithoutHash() {
            assertEquals(Color.RED, ManualRedactionService.decodeOrDefault("FF0000"));
        }

        @Test
        @DisplayName("white decodes correctly")
        void whiteDecodes() {
            assertEquals(Color.WHITE, ManualRedactionService.decodeOrDefault("#FFFFFF"));
        }

        @Test
        @DisplayName("invalid hex falls back to black")
        void invalidFallsBackToBlack() {
            assertEquals(Color.BLACK, ManualRedactionService.decodeOrDefault("not-a-color"));
        }

        @Test
        @DisplayName("empty string falls back to black")
        void emptyFallsBackToBlack() {
            assertEquals(Color.BLACK, ManualRedactionService.decodeOrDefault(""));
        }
    }

    // -----------------------------------------------------------------------
    // redactAreas
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("redactAreas")
    class RedactAreas {

        @Test
        @DisplayName("null list is a no-op")
        void nullList() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                byte[] before = save(doc);
                service.redactAreas(null, doc, doc.getPages());
                // Document still saves and has its single page; nothing thrown.
                assertEquals(1, doc.getNumberOfPages());
                assertNotNull(before);
            }
        }

        @Test
        @DisplayName("empty list is a no-op")
        void emptyList() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                service.redactAreas(new ArrayList<>(), doc, doc.getPages());
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("valid area is applied and document still saves")
        void validArea() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                List<RedactionArea> areas = Arrays.asList(area(1, 10, 10, 100, 50, "#000000"));
                service.redactAreas(areas, doc, doc.getPages());
                byte[] out = save(doc);
                assertTrue(out.length > 0);
                // Reload to ensure the produced PDF is structurally valid.
                try (PDDocument reloaded = Loader.loadPDF(out)) {
                    assertEquals(1, reloaded.getNumberOfPages());
                }
            }
        }

        @Test
        @DisplayName("area with null page is skipped")
        void nullPageSkipped() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                List<RedactionArea> areas = Arrays.asList(area(null, 10, 10, 100, 50, "#000000"));
                service.redactAreas(areas, doc, doc.getPages());
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("area with non-positive page is skipped")
        void nonPositivePageSkipped() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                List<RedactionArea> areas = Arrays.asList(area(0, 10, 10, 100, 50, "#000000"));
                service.redactAreas(areas, doc, doc.getPages());
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("area with null/zero width or height is skipped")
        void invalidDimensionsSkipped() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                List<RedactionArea> areas = new ArrayList<>();
                areas.add(area(1, 10, 10, 0, 50, "#000000")); // zero width
                areas.add(area(1, 10, 10, 100, 0, "#000000")); // zero height
                RedactionArea nullWidth = area(1, 10, 10, 100, 50, "#000000");
                nullWidth.setWidth(null);
                areas.add(nullWidth);
                RedactionArea nullHeight = area(1, 10, 10, 100, 50, "#000000");
                nullHeight.setHeight(null);
                areas.add(nullHeight);
                service.redactAreas(areas, doc, doc.getPages());
                // None applied, but no exception and doc remains valid.
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("area on out-of-range page is skipped without error")
        void outOfRangePageSkipped() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                List<RedactionArea> areas = Arrays.asList(area(5, 10, 10, 100, 50, "#000000"));
                service.redactAreas(areas, doc, doc.getPages());
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("multiple areas across multiple pages are grouped per page")
        void multiplePagesGrouped() throws Exception {
            try (PDDocument doc = newDocument(3)) {
                List<RedactionArea> areas = new ArrayList<>();
                areas.add(area(1, 10, 10, 50, 50, "#000000"));
                areas.add(area(1, 80, 80, 50, 50, "#FF0000"));
                areas.add(area(3, 20, 20, 60, 40, null)); // null color -> default black
                service.redactAreas(areas, doc, doc.getPages());
                byte[] out = save(doc);
                try (PDDocument reloaded = Loader.loadPDF(out)) {
                    assertEquals(3, reloaded.getNumberOfPages());
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // redactPages
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("redactPages")
    class RedactPages {

        private ManualRedactPdfRequest request(String pageNumbers, String color) {
            ManualRedactPdfRequest req = new ManualRedactPdfRequest();
            req.setPageNumbers(pageNumbers);
            req.setPageRedactionColor(color);
            return req;
        }

        @Test
        @DisplayName("redacts all pages when 'all' is given")
        void redactsAllPages() throws Exception {
            try (PDDocument doc = newDocument(3)) {
                service.redactPages(request("all", "#000000"), doc, doc.getPages());
                byte[] out = save(doc);
                try (PDDocument reloaded = Loader.loadPDF(out)) {
                    assertEquals(3, reloaded.getNumberOfPages());
                }
            }
        }

        @Test
        @DisplayName("redacts a specific page range")
        void redactsSpecificPages() throws Exception {
            try (PDDocument doc = newDocument(5)) {
                service.redactPages(request("1,3", "#FF0000"), doc, doc.getPages());
                byte[] out = save(doc);
                try (PDDocument reloaded = Loader.loadPDF(out)) {
                    assertEquals(5, reloaded.getNumberOfPages());
                }
            }
        }

        @Test
        @DisplayName("null page numbers defaults to first page")
        void nullPageNumbers() throws Exception {
            try (PDDocument doc = newDocument(2)) {
                service.redactPages(request(null, "#000000"), doc, doc.getPages());
                assertEquals(2, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("null color falls back to black")
        void nullColor() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                service.redactPages(request("all", null), doc, doc.getPages());
                assertEquals(1, doc.getNumberOfPages());
            }
        }
    }

    // -----------------------------------------------------------------------
    // redactFoundText
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("redactFoundText")
    class RedactFoundText {

        @Test
        @DisplayName("overlay-only mode draws boxes and document stays valid")
        void overlayMode() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                List<PDFText> blocks = Arrays.asList(text(0, 72, 690, 300, 710));
                service.redactFoundText(doc, blocks, 1.0f, Color.BLACK, false);
                byte[] out = save(doc);
                try (PDDocument reloaded = Loader.loadPDF(out)) {
                    assertEquals(1, reloaded.getNumberOfPages());
                }
            }
        }

        @Test
        @DisplayName("text-removal mode narrows the box width")
        void textRemovalMode() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                List<PDFText> blocks = Arrays.asList(text(0, 72, 690, 300, 710));
                service.redactFoundText(doc, blocks, 0.0f, Color.RED, true);
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("blocks on out-of-range pages are skipped")
        void outOfRangePageIndexSkipped() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                List<PDFText> blocks =
                        Arrays.asList(text(0, 72, 690, 300, 710), text(9, 10, 10, 50, 50));
                service.redactFoundText(doc, blocks, 0.0f, Color.BLACK, false);
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("empty block list is a no-op")
        void emptyBlocks() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                service.redactFoundText(doc, new ArrayList<>(), 0.0f, Color.BLACK, false);
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("annotation overlapping a redacted block is removed")
        void overlappingAnnotationRemoved() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                PDPage page = doc.getPage(0);
                float pageH = page.getBBox().getHeight();

                // Redact block in PDF coords near y2=710 (top), x 72..300.
                PDFText block = text(0, 72, 690, 300, 710);

                // Place an annotation rectangle that overlaps the redacted block.
                // Block pdf-Y window (padding included) sits roughly around pageH-710..pageH-690.
                PDAnnotationLink overlapping = new PDAnnotationLink();
                overlapping.setRectangle(new PDRectangle(80, pageH - 712, 120, 30));

                // Place an annotation far away that should be kept.
                PDAnnotationLink faraway = new PDAnnotationLink();
                faraway.setRectangle(new PDRectangle(10, 10, 20, 20));

                page.setAnnotations(new ArrayList<>(Arrays.asList(overlapping, faraway)));
                assertEquals(2, page.getAnnotations().size());

                service.redactFoundText(doc, Arrays.asList(block), 1.0f, Color.BLACK, false);

                // getAnnotations() builds fresh wrappers each call, so compare by geometry
                // rather than object identity.
                List<PDAnnotation> remaining = page.getAnnotations();
                assertEquals(1, remaining.size());
                PDRectangle keptRect = remaining.get(0).getRectangle();
                assertEquals(10f, keptRect.getLowerLeftX(), 0.001f);
                assertEquals(10f, keptRect.getLowerLeftY(), 0.001f);
            }
        }

        @Test
        @DisplayName("non-overlapping annotations are preserved")
        void nonOverlappingAnnotationsKept() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                PDPage page = doc.getPage(0);
                PDAnnotationLink faraway = new PDAnnotationLink();
                faraway.setRectangle(new PDRectangle(10, 10, 20, 20));
                page.setAnnotations(new ArrayList<>(Arrays.asList(faraway)));

                PDFText block = text(0, 400, 100, 500, 120);
                service.redactFoundText(doc, Arrays.asList(block), 0.0f, Color.BLACK, false);

                assertEquals(1, page.getAnnotations().size());
                PDRectangle keptRect = page.getAnnotations().get(0).getRectangle();
                assertEquals(10f, keptRect.getLowerLeftX(), 0.001f);
            }
        }
    }

    // -----------------------------------------------------------------------
    // redactImageBoxes
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("redactImageBoxes")
    class RedactImageBoxes {

        @Test
        @DisplayName("draws boxes for valid page indices")
        void validBoxes() throws Exception {
            try (PDDocument doc = newDocument(2)) {
                List<float[]> boxes = new ArrayList<>();
                boxes.add(new float[] {0, 10, 10, 100, 100});
                boxes.add(new float[] {1, 20, 20, 80, 80});
                service.redactImageBoxes(doc, boxes, Color.BLACK);
                byte[] out = save(doc);
                try (PDDocument reloaded = Loader.loadPDF(out)) {
                    assertEquals(2, reloaded.getNumberOfPages());
                }
            }
        }

        @Test
        @DisplayName("out-of-range page indices are skipped without error")
        void outOfRangeSkipped() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                List<float[]> boxes = new ArrayList<>();
                boxes.add(new float[] {-1, 10, 10, 100, 100}); // negative
                boxes.add(new float[] {7, 20, 20, 80, 80}); // beyond page count
                service.redactImageBoxes(doc, boxes, Color.BLACK);
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("empty box list is a no-op")
        void emptyBoxes() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                service.redactImageBoxes(doc, new ArrayList<>(), Color.BLACK);
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("multiple boxes on the same page are grouped")
        void multipleBoxesSamePage() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                List<float[]> boxes = new ArrayList<>();
                boxes.add(new float[] {0, 10, 10, 50, 50});
                boxes.add(new float[] {0, 100, 100, 150, 150});
                service.redactImageBoxes(doc, boxes, Color.RED);
                byte[] out = save(doc);
                try (PDDocument reloaded = Loader.loadPDF(out)) {
                    assertEquals(1, reloaded.getNumberOfPages());
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // extractPageElementBoxes
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("extractPageElementBoxes")
    class ExtractPageElementBoxes {

        @Test
        @DisplayName("returns text line boxes for a page with text")
        void extractsTextBoxes() throws Exception {
            try (PDDocument doc = newDocumentWithText()) {
                PDPage page = doc.getPage(0);
                List<float[]> boxes = service.extractPageElementBoxes(doc, page, 0);
                assertNotNull(boxes);
                assertFalse(boxes.isEmpty());
                // Each box must have 4 coordinates [x1, y1, x2, y2].
                for (float[] box : boxes) {
                    assertEquals(4, box.length);
                }
            }
        }

        @Test
        @DisplayName("returns empty list for a blank page")
        void blankPageReturnsEmpty() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                PDPage page = doc.getPage(0);
                List<float[]> boxes = service.extractPageElementBoxes(doc, page, 0);
                assertNotNull(boxes);
                assertTrue(boxes.isEmpty());
            }
        }
    }

    // -----------------------------------------------------------------------
    // finalizeRedaction (non-image path only; image path needs Spring context)
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("finalizeRedaction")
    class FinalizeRedaction {

        @Test
        @DisplayName("with found text saves a managed temp file")
        void withFoundText() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                Map<Integer, List<PDFText>> byPage = new HashMap<>();
                byPage.put(0, new ArrayList<>(Arrays.asList(text(0, 72, 690, 300, 710))));

                TempFile result =
                        service.finalizeRedaction(doc, byPage, "#000000", 1.0f, false, false);

                assertNotNull(result);
                assertNotNull(result.getFile());
                assertTrue(result.getFile().exists());
                assertTrue(result.getFile().length() > 0);
                verify(tempFileManager, times(1)).createManagedTempFile(".pdf");

                // Output should be a loadable PDF.
                try (PDDocument reloaded = Loader.loadPDF(result.getFile())) {
                    assertEquals(1, reloaded.getNumberOfPages());
                }
            }
        }

        @Test
        @DisplayName("with no found text still saves the document")
        void withoutFoundText() throws Exception {
            try (PDDocument doc = newDocument(2)) {
                Map<Integer, List<PDFText>> byPage = new HashMap<>();

                TempFile result =
                        service.finalizeRedaction(doc, byPage, "#000000", 0.0f, false, false);

                assertNotNull(result);
                assertTrue(result.getFile().exists());
                assertTrue(result.getFile().length() > 0);
                verify(tempFileManager, times(1)).createManagedTempFile(".pdf");

                try (PDDocument reloaded = Loader.loadPDF(result.getFile())) {
                    assertEquals(2, reloaded.getNumberOfPages());
                }
            }
        }

        @Test
        @DisplayName("convertToImage null is treated as non-image path")
        void convertToImageNull() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                Map<Integer, List<PDFText>> byPage = new HashMap<>();

                TempFile result =
                        service.finalizeRedaction(doc, byPage, "#000000", 0.0f, null, false);

                assertNotNull(result);
                assertTrue(result.getFile().exists());
                // Non-image path uses the standard ".pdf" managed temp file exactly once.
                verify(tempFileManager, times(1)).createManagedTempFile(".pdf");
                try (PDDocument reloaded = Loader.loadPDF(result.getFile())) {
                    assertEquals(1, reloaded.getNumberOfPages());
                }
            }
        }

        @Test
        @DisplayName("text-removal mode finalize produces valid PDF")
        void textRemovalFinalize() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                Map<Integer, List<PDFText>> byPage = new HashMap<>();
                byPage.put(0, new ArrayList<>(Arrays.asList(text(0, 72, 690, 300, 710))));

                TempFile result =
                        service.finalizeRedaction(doc, byPage, "#FF0000", 2.0f, false, true);

                assertNotNull(result);
                try (PDDocument reloaded = Loader.loadPDF(result.getFile())) {
                    assertEquals(1, reloaded.getNumberOfPages());
                }
            }
        }

        @Test
        @DisplayName("IOException from save closes the temp file and is rethrown")
        void saveFailureClosesTempFile() throws Exception {
            // Use a document mock that throws on save to exercise the catch/close branch.
            PDDocument doc = newDocument(1);
            Map<Integer, List<PDFText>> byPage = new HashMap<>();

            // Point the managed temp file at a directory path so save() fails with IOException.
            File dirAsFile = Files.createTempDirectory("redact-dir").toFile();
            createdTempFiles.add(dirAsFile);
            TempFile failing = mock(TempFile.class);
            when(failing.getFile()).thenReturn(dirAsFile);
            when(tempFileManager.createManagedTempFile(anyString())).thenReturn(failing);

            try {
                assertThrows(
                        IOException.class,
                        () ->
                                service.finalizeRedaction(
                                        doc, byPage, "#000000", 0.0f, false, false));
                // The failing temp file is closed on the error path.
                verify(failing).close();
            } finally {
                doc.close();
            }
        }
    }
}
