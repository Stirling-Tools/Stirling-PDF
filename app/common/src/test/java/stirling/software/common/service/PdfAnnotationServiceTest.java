package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationText;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.api.comments.AnnotationLocation;
import stirling.software.common.model.api.comments.StickyNoteSpec;

class PdfAnnotationServiceTest {

    private PdfAnnotationService service;

    @BeforeEach
    void setUp() {
        service = new PdfAnnotationService();
    }

    @Test
    void addStickyNotesPlacesOneAnnotationPerValidSpec() throws IOException {
        byte[] bytes = twoPagePdfBytes();
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            List<StickyNoteSpec> specs =
                    List.of(
                            spec(0, 72f, 700f, "First comment", "alice", null),
                            spec(1, 100f, 650f, "Second comment", null, "Second"));

            int applied = service.addStickyNotes(doc, specs);

            assertEquals(2, applied);
            byte[] saved = save(doc);
            try (PDDocument reloaded = Loader.loadPDF(saved)) {
                assertEquals(1, textAnnotations(reloaded.getPage(0).getAnnotations()).size());
                assertEquals(1, textAnnotations(reloaded.getPage(1).getAnnotations()).size());

                PDAnnotationText first =
                        textAnnotations(reloaded.getPage(0).getAnnotations()).get(0);
                assertEquals("First comment", first.getContents());
                assertEquals("alice", first.getTitlePopup(), "author override propagates");
                assertNotNull(first.getSubject(), "subject falls back to default when null");
            }
        }
    }

    @Test
    void skipsSpecsWithBlankText() throws IOException {
        byte[] bytes = twoPagePdfBytes();
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            List<StickyNoteSpec> specs =
                    List.of(
                            spec(0, 72f, 700f, "Valid", null, null),
                            spec(0, 72f, 680f, "   ", null, null));

            int applied = service.addStickyNotes(doc, specs);

            assertEquals(1, applied, "Blank-text spec must be skipped");
        }
    }

    @Test
    void skipsSpecsWithOutOfRangePageIndex() throws IOException {
        byte[] bytes = twoPagePdfBytes();
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            List<StickyNoteSpec> specs =
                    List.of(
                            spec(0, 72f, 700f, "OK", null, null),
                            spec(99, 72f, 700f, "Too far", null, null),
                            spec(-1, 72f, 700f, "Negative", null, null));

            int applied = service.addStickyNotes(doc, specs);

            assertEquals(1, applied, "Only the in-range spec should be applied");
        }
    }

    @Test
    void handlesNullAndEmptySpecList() throws IOException {
        byte[] bytes = twoPagePdfBytes();
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            assertEquals(0, service.addStickyNotes(doc, null));
            assertEquals(0, service.addStickyNotes(doc, List.of()));
        }
    }

    @Test
    void skipsSpecsWithNonPositiveDimensions() throws IOException {
        byte[] bytes = twoPagePdfBytes();
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            StickyNoteSpec zeroWidth =
                    new StickyNoteSpec(
                            new AnnotationLocation(0, 72f, 700f, 0f, 20f),
                            "Zero width",
                            null,
                            null);
            StickyNoteSpec negativeHeight =
                    new StickyNoteSpec(
                            new AnnotationLocation(0, 72f, 680f, 20f, -5f),
                            "Negative height",
                            null,
                            null);
            List<StickyNoteSpec> specs =
                    List.of(spec(0, 72f, 660f, "OK", null, null), zeroWidth, negativeHeight);

            int applied = service.addStickyNotes(doc, specs);

            assertEquals(1, applied, "Only the positively-sized spec should be applied");
        }
    }

    @Test
    void skipsSpecsWithOverlongText() throws IOException {
        byte[] bytes = twoPagePdfBytes();
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            String overlong = "x".repeat(100_001);
            List<StickyNoteSpec> specs =
                    List.of(
                            spec(0, 72f, 700f, "Short", null, null),
                            spec(0, 72f, 680f, overlong, null, null));

            int applied = service.addStickyNotes(doc, specs);

            assertEquals(1, applied, "Overlong-text spec must be skipped");
        }
    }

    @Test
    void appliesDefaultAuthorAndSubjectWhenAbsent() throws IOException {
        byte[] bytes = twoPagePdfBytes();
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            service.addStickyNote(doc, spec(0, 72f, 700f, "No author given", null, null));

            byte[] saved = save(doc);
            try (PDDocument reloaded = Loader.loadPDF(saved)) {
                PDAnnotationText annot =
                        textAnnotations(reloaded.getPage(0).getAnnotations()).get(0);
                assertTrue(
                        annot.getTitlePopup() != null && !annot.getTitlePopup().isBlank(),
                        "Default author should be applied");
                assertTrue(
                        annot.getSubject() != null && !annot.getSubject().isBlank(),
                        "Default subject should be applied");
            }
        }
    }

    // --- helpers ---

    private static StickyNoteSpec spec(
            int page, float x, float y, String text, String author, String subject) {
        return new StickyNoteSpec(
                new AnnotationLocation(page, x, y, 20f, 20f), text, author, subject);
    }

    private static byte[] twoPagePdfBytes() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            doc.addPage(new PDPage(PDRectangle.A4));
            return save(doc);
        }
    }

    private static byte[] save(PDDocument doc) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        doc.save(baos);
        return baos.toByteArray();
    }

    private static List<PDAnnotationText> textAnnotations(List<PDAnnotation> annotations) {
        List<PDAnnotationText> out = new ArrayList<>();
        for (PDAnnotation a : annotations) {
            if (a instanceof PDAnnotationText t) {
                out.add(t);
            }
        }
        return out;
    }
}
