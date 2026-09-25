package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.PDFText;

/**
 * Unit tests for {@link TextRedactionService}. Exercises the pure text-matching / placeholder
 * logic, the public find/replace entry points, and the small helper predicates. PDFs are built tiny
 * and in-memory with real Standard14 fonts so the redaction pipeline runs end-to-end without
 * external processes.
 */
class TextRedactionServiceTest {

    private static final float FONT_SIZE = 12f;
    private static final float LEFT_X = 72f;
    private static final float TOP_Y = PDRectangle.LETTER.getHeight() - 80f;

    private final TextRedactionService service = new TextRedactionService();

    // ── fixtures ─────────────────────────────────────────────────────────────────────────────────

    private PDFont helvetica() {
        return new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    }

    private PDFont helvetica(PDDocument doc) throws IOException {
        try (InputStream is =
                getClass().getResourceAsStream("/type3/library/fonts/dejavu/DejaVuSans.ttf")) {
            if (is != null) {
                return PDType0Font.load(doc, is);
            }
        }
        return helvetica();
    }

    /** Single page, single Tj line per supplied text line, Helvetica 12. */
    private PDDocument buildDoc(String... lines) throws IOException {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.setFont(helvetica(doc), FONT_SIZE);
            for (int i = 0; i < lines.length; i++) {
                cs.beginText();
                cs.newLineAtOffset(LEFT_X, TOP_Y - i * 16f);
                cs.showText(lines[i]);
                cs.endText();
            }
        }
        return doc;
    }

    private PDDocument buildEmptyDoc() {
        PDDocument doc = new PDDocument();
        doc.addPage(new PDPage(PDRectangle.LETTER));
        return doc;
    }

    // ── findTextToRedact ─────────────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("findTextToRedact")
    class FindTextToRedact {

        @Test
        @DisplayName("returns empty map when all search terms are blank")
        void emptyTermsReturnsEmptyMap() throws IOException {
            try (PDDocument doc = buildDoc("Confidential data here")) {
                Map<Integer, List<PDFText>> result =
                        service.findTextToRedact(doc, new String[] {"", "   "}, false, false);
                assertTrue(result.isEmpty());
            }
        }

        @Test
        @DisplayName("returns empty map for an empty term array")
        void emptyArrayReturnsEmptyMap() throws IOException {
            try (PDDocument doc = buildDoc("Some text")) {
                Map<Integer, List<PDFText>> result =
                        service.findTextToRedact(doc, new String[] {}, false, false);
                assertTrue(result.isEmpty());
            }
        }

        @Test
        @DisplayName("finds a literal term on the page")
        void findsLiteralTerm() throws IOException {
            try (PDDocument doc = buildDoc("Hello SECRET world")) {
                Map<Integer, List<PDFText>> result =
                        service.findTextToRedact(doc, new String[] {"SECRET"}, false, false);

                assertFalse(result.isEmpty());
                assertTrue(result.containsKey(0), "match should be on page index 0");
                List<PDFText> hits = result.get(0);
                assertEquals(1, hits.size());
                assertEquals("SECRET", hits.get(0).getText());
            }
        }

        @Test
        @DisplayName("does not find a term that is absent")
        void doesNotFindAbsentTerm() throws IOException {
            try (PDDocument doc = buildDoc("Hello world")) {
                Map<Integer, List<PDFText>> result =
                        service.findTextToRedact(doc, new String[] {"NOTHERE"}, false, false);
                assertTrue(result.isEmpty());
            }
        }

        @Test
        @DisplayName("regex term matches digit runs")
        void regexTermMatchesDigits() throws IOException {
            try (PDDocument doc = buildDoc("Order 12345 shipped")) {
                Map<Integer, List<PDFText>> result =
                        service.findTextToRedact(doc, new String[] {"\\d+"}, true, false);

                assertFalse(result.isEmpty());
                assertEquals("12345", result.get(0).get(0).getText());
            }
        }

        @Test
        @DisplayName("whole-word search does not match a substring inside a larger word")
        void wholeWordDoesNotMatchSubstring() throws IOException {
            try (PDDocument doc = buildDoc("classification of cats")) {
                Map<Integer, List<PDFText>> result =
                        service.findTextToRedact(doc, new String[] {"cat"}, false, true);
                // "cat" appears only inside "classification"; whole-word must not match it.
                assertTrue(result.isEmpty());
            }
        }

        @Test
        @DisplayName("whole-word search matches a standalone word")
        void wholeWordMatchesStandalone() throws IOException {
            try (PDDocument doc = buildDoc("the cat sat")) {
                Map<Integer, List<PDFText>> result =
                        service.findTextToRedact(doc, new String[] {"cat"}, false, true);
                assertFalse(result.isEmpty());
                assertEquals("cat", result.get(0).get(0).getText());
            }
        }

        @Test
        @DisplayName("trims whitespace around terms before searching")
        void trimsTermsBeforeSearch() throws IOException {
            try (PDDocument doc = buildDoc("padded SECRET value")) {
                Map<Integer, List<PDFText>> result =
                        service.findTextToRedact(doc, new String[] {"  SECRET  "}, false, false);
                assertFalse(result.isEmpty());
                assertEquals("SECRET", result.get(0).get(0).getText());
            }
        }
    }

    // ── performTextReplacement ───────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("performTextReplacement")
    class PerformTextReplacement {

        @Test
        @DisplayName("returns false (no fallback) when there is nothing found to redact")
        void noFoundTextReturnsFalse() throws IOException {
            try (PDDocument doc = buildDoc("anything")) {
                boolean fallback =
                        service.performTextReplacement(
                                doc, new HashMap<>(), new String[] {"x"}, false, false);
                assertFalse(fallback, "empty found-text map must short-circuit to no fallback");
            }
        }

        @Test
        @DisplayName("replaces text on a standard-font document without requesting box fallback")
        void replacesOnStandardFont() throws IOException {
            try (PDDocument doc = buildDoc("Please redact SECRET now")) {
                Map<Integer, List<PDFText>> found =
                        service.findTextToRedact(doc, new String[] {"SECRET"}, false, false);
                assertFalse(found.isEmpty());

                boolean fallback =
                        service.performTextReplacement(
                                doc, found, new String[] {"SECRET"}, false, false);

                assertFalse(fallback, "standard Helvetica should not trigger box-only fallback");
                // After replacement the literal term should no longer be extractable.
                Map<Integer, List<PDFText>> afterFound =
                        service.findTextToRedact(doc, new String[] {"SECRET"}, false, false);
                assertTrue(afterFound.isEmpty(), "SECRET should be gone after text replacement");
            }
        }

        @Test
        @DisplayName("leaves non-targeted text intact after replacement")
        void leavesOtherTextIntact() throws IOException {
            try (PDDocument doc = buildDoc("KEEP this but redact SECRET part")) {
                Map<Integer, List<PDFText>> found =
                        service.findTextToRedact(doc, new String[] {"SECRET"}, false, false);

                service.performTextReplacement(doc, found, new String[] {"SECRET"}, false, false);

                Map<Integer, List<PDFText>> keepStill =
                        service.findTextToRedact(doc, new String[] {"KEEP"}, false, false);
                assertFalse(keepStill.isEmpty(), "untargeted word KEEP must survive redaction");
            }
        }
    }

    // ── inner data classes ───────────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("TextSegment / MatchRange data classes")
    class DataClasses {

        @Test
        @DisplayName("TextSegment exposes its constructor values via accessors")
        void textSegmentAccessors() {
            PDFont font = helvetica();
            TextRedactionService.TextSegment segment =
                    new TextRedactionService.TextSegment(3, "Tj", "hello", 10, 15, font, 12f);

            assertEquals(3, segment.getTokenIndex());
            assertEquals("Tj", segment.getOperatorName());
            assertEquals("hello", segment.getText());
            assertEquals(10, segment.getStartPos());
            assertEquals(15, segment.getEndPos());
            assertSame(font, segment.getFont());
            assertEquals(12f, segment.getFontSize());
        }

        @Test
        @DisplayName("MatchRange exposes start and end positions")
        void matchRangeAccessors() {
            TextRedactionService.MatchRange range = new TextRedactionService.MatchRange(4, 9);
            assertEquals(4, range.getStartPos());
            assertEquals(9, range.getEndPos());
        }

        @Test
        @DisplayName("MatchRange equality follows its data fields")
        void matchRangeEquality() {
            assertEquals(
                    new TextRedactionService.MatchRange(1, 5),
                    new TextRedactionService.MatchRange(1, 5));
            assertNotEquals(
                    new TextRedactionService.MatchRange(1, 5),
                    new TextRedactionService.MatchRange(1, 6));
        }

        private void assertNotEquals(Object a, Object b) {
            assertFalse(a.equals(b));
        }
    }
}
