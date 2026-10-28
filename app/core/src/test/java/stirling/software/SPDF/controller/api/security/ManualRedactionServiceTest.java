package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination.PDPageFitDestination;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.ManualRedactPdfRequest;
import stirling.software.common.model.api.security.RedactionArea;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.jpdfium.PdfDocument;

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
                service.redactAreas(null, doc, doc.getPages(), false);
                // Document still saves and has its single page; nothing thrown.
                assertEquals(1, doc.getNumberOfPages());
                assertNotNull(before);
            }
        }

        @Test
        @DisplayName("empty list is a no-op")
        void emptyList() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                service.redactAreas(new ArrayList<>(), doc, doc.getPages(), false);
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("valid area is applied and document still saves")
        void validArea() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                List<RedactionArea> areas = Arrays.asList(area(1, 10, 10, 100, 50, "#000000"));
                service.redactAreas(areas, doc, doc.getPages(), false);
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
                service.redactAreas(areas, doc, doc.getPages(), false);
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("area with non-positive page is skipped")
        void nonPositivePageSkipped() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                List<RedactionArea> areas = Arrays.asList(area(0, 10, 10, 100, 50, "#000000"));
                service.redactAreas(areas, doc, doc.getPages(), false);
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
                service.redactAreas(areas, doc, doc.getPages(), false);
                // None applied, but no exception and doc remains valid.
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("area on out-of-range page is skipped without error")
        void outOfRangePageSkipped() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                List<RedactionArea> areas = Arrays.asList(area(5, 10, 10, 100, 50, "#000000"));
                service.redactAreas(areas, doc, doc.getPages(), false);
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
                service.redactAreas(areas, doc, doc.getPages(), false);
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
                service.redactFoundText(doc, blocks, 1.0f, Color.BLACK, false, false);
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
                service.redactFoundText(doc, blocks, 0.0f, Color.RED, true, false);
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("blocks on out-of-range pages are skipped")
        void outOfRangePageIndexSkipped() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                List<PDFText> blocks =
                        Arrays.asList(text(0, 72, 690, 300, 710), text(9, 10, 10, 50, 50));
                service.redactFoundText(doc, blocks, 0.0f, Color.BLACK, false, false);
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("empty block list is a no-op")
        void emptyBlocks() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                service.redactFoundText(doc, new ArrayList<>(), 0.0f, Color.BLACK, false, false);
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

                service.redactFoundText(doc, Arrays.asList(block), 1.0f, Color.BLACK, false, false);

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
                service.redactFoundText(doc, Arrays.asList(block), 0.0f, Color.BLACK, false, false);

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
                service.redactImageBoxes(doc, boxes, Color.BLACK, false);
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
                service.redactImageBoxes(doc, boxes, Color.BLACK, false);
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("empty box list is a no-op")
        void emptyBoxes() throws Exception {
            try (PDDocument doc = newDocument(1)) {
                service.redactImageBoxes(doc, new ArrayList<>(), Color.BLACK, false);
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
                service.redactImageBoxes(doc, boxes, Color.RED, false);
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
                        service.finalizeRedaction(
                                doc, byPage, "#000000", 1.0f, false, false, false);

                assertNotNull(result);
                assertNotNull(result.getFile());
                assertTrue(result.getFile().exists());
                assertTrue(result.getFile().length() > 0);
                // Two more temp files carry the copy JPDFium clears the found text in.
                verify(tempFileManager, times(3)).createManagedTempFile(".pdf");

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
                        service.finalizeRedaction(
                                doc, byPage, "#000000", 0.0f, false, false, false);

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
                        service.finalizeRedaction(doc, byPage, "#000000", 0.0f, null, false, false);

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
                        service.finalizeRedaction(doc, byPage, "#FF0000", 2.0f, false, true, false);

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
                                        doc, byPage, "#000000", 0.0f, false, false, false));
                // The failing temp file is closed on the error path.
                verify(failing).close();
            } finally {
                doc.close();
            }
        }
    }

    // -----------------------------------------------------------------------
    // What is left in the file under a box
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("content under boxes")
    class ContentUnderBoxes {

        private static final String SECRET = "SECRET-12345 on page one";
        private static final String NEIGHBOUR = "Second line stays visible";
        // Two red columns then two green ones, so a cleared half is recognisable.
        private static final int LEFT_PIXEL = 0xFF0000;

        /** Letter page: the secret at baseline 700, a neighbour at 650, an image at 72,300. */
        private PDDocument documentWithTextAndImage(int pages) throws IOException {
            PDDocument doc = new PDDocument();
            PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            for (int i = 0; i < pages; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                BufferedImage img = new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB);
                for (int x = 0; x < 8; x++) {
                    for (int y = 0; y < 8; y++) {
                        img.setRGB(x, y, x < 4 ? LEFT_PIXEL : 0x00FF00);
                    }
                }
                PDImageXObject image = LosslessFactory.createFromImage(doc, img);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.beginText();
                    cs.setFont(font, 14);
                    cs.newLineAtOffset(72, 700);
                    cs.showText(SECRET);
                    cs.endText();
                    cs.beginText();
                    cs.setFont(font, 14);
                    cs.newLineAtOffset(72, 650);
                    cs.showText(NEIGHBOUR);
                    cs.endText();
                    cs.drawImage(image, 72, 300, 200, 200);
                }
            }
            return doc;
        }

        private String pageText(PDDocument doc, int pageIndex) throws IOException {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setStartPage(pageIndex + 1);
            stripper.setEndPage(pageIndex + 1);
            return stripper.getText(doc);
        }

        private List<BufferedImage> pageImages(PDDocument doc, int pageIndex) throws IOException {
            List<BufferedImage> images = new ArrayList<>();
            PDResources resources = doc.getPage(pageIndex).getResources();
            for (COSName name : resources.getXObjectNames()) {
                PDXObject xObject = resources.getXObject(name);
                if (xObject instanceof PDImageXObject image) {
                    images.add(image.getImage());
                }
            }
            return images;
        }

        /** RedactionArea measures y from the top of the page. */
        private RedactionArea areaFromBottom(int page, float x, float y, float w, float h) {
            return area(page, x, PDRectangle.LETTER.getHeight() - y - h, w, h, "#000000");
        }

        @Test
        @DisplayName("an area removes the text under it and keeps the line below")
        void areaRemovesTextUnderIt() throws Exception {
            try (PDDocument doc = documentWithTextAndImage(1)) {
                service.redactAreas(
                        List.of(areaFromBottom(1, 70, 695, 300, 22)), doc, doc.getPages(), false);
                String text = pageText(doc, 0);
                assertFalse(text.contains("SECRET"), text);
                assertTrue(text.contains(NEIGHBOUR), text);
            }
        }

        @Test
        @DisplayName("an image box clears the pixels under it, not the rest of the image")
        void imageBoxClearsCoveredPixels() throws Exception {
            try (PDDocument doc = documentWithTextAndImage(1)) {
                service.redactImageBoxes(
                        doc,
                        List.<float[]>of(new float[] {0, 172, 500, 272, 300}),
                        Color.BLACK,
                        false);
                List<BufferedImage> images = pageImages(doc, 0);
                assertEquals(1, images.size());
                BufferedImage image = images.get(0);
                int middle = image.getHeight() / 2;
                assertEquals(LEFT_PIXEL, image.getRGB(0, middle) & 0xFFFFFF);
                assertEquals(0, image.getRGB(image.getWidth() - 1, middle) & 0xFFFFFF);
            }
        }

        /** The 8x8 photo is still the only image, so the page was not rasterised. */
        private void assertNotRasterised(PDDocument doc, int pageIndex) throws IOException {
            List<BufferedImage> images = pageImages(doc, pageIndex);
            assertEquals(1, images.size());
            assertEquals(8, images.get(0).getWidth());
        }

        @Test
        @DisplayName("a box over most of a line's height removes the line, not the page")
        void boxOverMostOfALineRemovesIt() throws Exception {
            try (PDDocument doc = documentWithTextAndImage(1)) {
                // The 14pt line's capitals run from about 700 to 710; this covers 700 to 707.
                service.redactAreas(
                        List.of(areaFromBottom(1, 60, 697, 300, 10)), doc, doc.getPages(), false);
                String text = pageText(doc, 0);
                assertFalse(text.contains("SECRET"), text);
                assertTrue(text.contains(NEIGHBOUR), text);
                assertNotRasterised(doc, 0);
            }
        }

        @Test
        @DisplayName("a thin strip across a line leaves the letters it covers less than half of")
        void thinStripLeavesMostlyUncoveredLetters() throws Exception {
            try (PDDocument doc = documentWithTextAndImage(1)) {
                service.redactAreas(
                        List.of(areaFromBottom(1, 60, 704, 300, 3)), doc, doc.getPages(), false);
                assertTrue(pageText(doc, 0).contains(SECRET));
                assertNotRasterised(doc, 0);
            }
        }

        @Test
        @DisplayName("a box cutting through a line rasterises that page and no other")
        void partialLineRasterisesThePage() throws Exception {
            try (PDDocument doc = documentWithTextAndImage(2)) {
                service.redactAreas(
                        List.of(areaFromBottom(1, 70, 646, 300, 7)), doc, doc.getPages(), false);

                assertTrue(pageText(doc, 0).isBlank());
                List<BufferedImage> page1 = pageImages(doc, 0);
                assertEquals(1, page1.size());
                assertTrue(page1.get(0).getWidth() > 1000, "a full-page render, not the photo");
                assertTrue(pageText(doc, 1).contains(SECRET));
            }
        }

        @Test
        @DisplayName("without JPDFium the boxed pages are rasterised rather than left covered")
        void missingNativeRasterises() throws Exception {
            try (PDDocument doc = documentWithTextAndImage(1);
                    MockedStatic<PdfDocument> nativeDoc = mockStatic(PdfDocument.class)) {
                nativeDoc
                        .when(() -> PdfDocument.open(any(Path.class)))
                        .thenThrow(new UnsatisfiedLinkError("no native library"));

                service.redactAreas(
                        List.of(areaFromBottom(1, 70, 695, 300, 22)), doc, doc.getPages(), false);

                assertTrue(pageText(doc, 0).isBlank());
            }
        }

        @Test
        @DisplayName("overlay-only boxes leave the covered text in the file")
        void overlayOnlyCoversOnly() throws Exception {
            try (PDDocument doc = documentWithTextAndImage(1)) {
                service.redactAreas(
                        List.of(areaFromBottom(1, 70, 695, 300, 22)), doc, doc.getPages(), true);
                assertTrue(pageText(doc, 0).contains(SECRET));
            }
        }

        @Test
        @DisplayName("found text without prior removal is removed by its block")
        void foundTextBlockRemoved() throws Exception {
            try (PDDocument doc = documentWithTextAndImage(1)) {
                Map<Integer, List<PDFText>> found =
                        new TextRedactionService()
                                .findTextToRedact(doc, new String[] {"SECRET-12345"}, false, false);
                service.redactFoundText(doc, found.get(0), 0f, Color.BLACK, false, false);
                String text = pageText(doc, 0);
                assertFalse(text.contains("SECRET-12345"), text);
                assertTrue(text.contains(NEIGHBOUR), text);
            }
        }

        @Test
        @DisplayName("the outline, form fields and other pages are not rebuilt")
        void documentStructureKept() throws Exception {
            try (PDDocument doc = documentWithTextAndImage(2)) {
                PDDocumentOutline outline = new PDDocumentOutline();
                PDOutlineItem bookmark = new PDOutlineItem();
                bookmark.setTitle("Page two");
                PDPageFitDestination destination = new PDPageFitDestination();
                destination.setPage(doc.getPage(1));
                bookmark.setDestination(destination);
                outline.addLast(bookmark);
                doc.getDocumentCatalog().setDocumentOutline(outline);

                PDAcroForm form = new PDAcroForm(doc);
                doc.getDocumentCatalog().setAcroForm(form);
                PDTextField field = new PDTextField(form);
                field.setPartialName("customerName");
                PDAnnotationWidget widget = field.getWidgets().get(0);
                widget.setRectangle(new PDRectangle(72, 100, 200, 20));
                widget.setPage(doc.getPage(0));
                doc.getPage(0).getAnnotations().add(widget);
                form.getFields().add(field);
                COSBase pageTwoContents =
                        doc.getPage(1).getCOSObject().getDictionaryObject(COSName.CONTENTS);

                service.redactAreas(
                        List.of(areaFromBottom(1, 70, 695, 300, 22)), doc, doc.getPages(), false);
                byte[] saved = save(doc);

                try (PDDocument reloaded = Loader.loadPDF(saved)) {
                    PDDocumentOutline kept = reloaded.getDocumentCatalog().getDocumentOutline();
                    int bookmarks = 0;
                    for (PDOutlineItem item : kept.children()) {
                        bookmarks++;
                        assertEquals(reloaded.getPage(1), item.findDestinationPage(reloaded));
                    }
                    assertEquals(1, bookmarks);
                    PDAcroForm keptForm = reloaded.getDocumentCatalog().getAcroForm();
                    assertEquals(1, keptForm.getFields().size());
                    assertEquals("customerName", keptForm.getFields().get(0).getPartialName());
                    assertEquals(1, reloaded.getPage(0).getAnnotations().size());
                }
                assertSame(
                        pageTwoContents,
                        doc.getPage(1).getCOSObject().getDictionaryObject(COSName.CONTENTS));
            }
        }

        @Test
        @DisplayName("a whole-page redaction leaves no text, images or annotations")
        void pageWipeRemovesEverything() throws Exception {
            try (PDDocument doc = documentWithTextAndImage(1)) {
                PDAnnotationLink link = new PDAnnotationLink();
                link.setRectangle(new PDRectangle(72, 690, 200, 20));
                doc.getPage(0).getAnnotations().add(link);
                ManualRedactPdfRequest request = new ManualRedactPdfRequest();
                request.setPageNumbers("1");

                service.redactPages(request, doc, doc.getPages());

                assertTrue(pageText(doc, 0).isBlank());
                assertTrue(pageImages(doc, 0).isEmpty());
                assertTrue(doc.getPage(0).getAnnotations().isEmpty());
            }
        }
    }
}
