package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
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

    /** Single page, single Tj line per supplied text line, Helvetica 12. */
    private PDDocument buildDoc(String... lines) throws IOException {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.setFont(helvetica(), FONT_SIZE);
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

    // ── isTextShowingOperator ────────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("isTextShowingOperator")
    class IsTextShowingOperator {

        @Test
        @DisplayName("recognises the four text-showing operators")
        void recognisesTextShowingOperators() {
            assertTrue(service.isTextShowingOperator("Tj"));
            assertTrue(service.isTextShowingOperator("TJ"));
            assertTrue(service.isTextShowingOperator("'"));
            assertTrue(service.isTextShowingOperator("\""));
        }

        @Test
        @DisplayName("rejects non text-showing operators and junk")
        void rejectsOthers() {
            assertFalse(service.isTextShowingOperator("BT"));
            assertFalse(service.isTextShowingOperator("ET"));
            assertFalse(service.isTextShowingOperator("Tf"));
            assertFalse(service.isTextShowingOperator(""));
            assertFalse(service.isTextShowingOperator("tj"));
        }
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

    // ── detectCustomEncodingFonts ────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("detectCustomEncodingFonts")
    class DetectCustomEncodingFonts {

        @Test
        @DisplayName("standard Helvetica document is not flagged as custom-encoded")
        void standardFontNotFlagged() throws IOException {
            try (PDDocument doc = buildDoc("plain helvetica text")) {
                assertFalse(service.detectCustomEncodingFonts(doc));
            }
        }

        @Test
        @DisplayName("document with no content / no fonts is not flagged")
        void emptyDocumentNotFlagged() throws IOException {
            try (PDDocument doc = buildEmptyDoc()) {
                assertFalse(service.detectCustomEncodingFonts(doc));
            }
        }
    }

    // ── createPlaceholderWithFont ────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("createPlaceholderWithFont")
    class CreatePlaceholderWithFont {

        @Test
        @DisplayName("returns the input unchanged for null")
        void nullReturnsNull() {
            assertNull(service.createPlaceholderWithFont(null, helvetica()));
        }

        @Test
        @DisplayName("returns the input unchanged for empty string")
        void emptyReturnsEmpty() {
            assertEquals("", service.createPlaceholderWithFont("", helvetica()));
        }

        @Test
        @DisplayName("non-subset font yields spaces matching the original length")
        void nonSubsetFontYieldsMatchingSpaces() {
            String placeholder = service.createPlaceholderWithFont("hidden", helvetica());
            assertEquals(" ".repeat("hidden".length()), placeholder);
        }

        @Test
        @DisplayName("null font is treated as non-subset and yields spaces")
        void nullFontYieldsSpaces() {
            String placeholder = service.createPlaceholderWithFont("abc", null);
            assertEquals("   ", placeholder);
        }
    }

    // ── createPlaceholderWithWidth ───────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("createPlaceholderWithWidth")
    class CreatePlaceholderWithWidth {

        @Test
        @DisplayName("returns the input unchanged for null")
        void nullReturnsNull() {
            assertNull(service.createPlaceholderWithWidth(null, 10f, helvetica(), FONT_SIZE));
        }

        @Test
        @DisplayName("returns the input unchanged for empty string")
        void emptyReturnsEmpty() {
            assertEquals("", service.createPlaceholderWithWidth("", 10f, helvetica(), FONT_SIZE));
        }

        @Test
        @DisplayName("null font falls back to one space per original character")
        void nullFontFallsBackToSpaces() {
            String placeholder = service.createPlaceholderWithWidth("word", 50f, null, FONT_SIZE);
            assertEquals(" ".repeat("word".length()), placeholder);
        }

        @Test
        @DisplayName("non-positive font size falls back to one space per original character")
        void nonPositiveFontSizeFallsBackToSpaces() {
            String placeholder = service.createPlaceholderWithWidth("word", 50f, helvetica(), 0f);
            assertEquals(" ".repeat("word".length()), placeholder);
        }

        @Test
        @DisplayName("standard font produces a non-null all-whitespace placeholder")
        void standardFontProducesWhitespacePlaceholder() {
            PDFont font = helvetica();
            float fontSize = FONT_SIZE;
            String original = "Secret";
            // Compute a realistic target width the way the service does (text-space / 1000 * size).
            float targetWidth;
            try {
                targetWidth = font.getStringWidth(original) / 1000f * fontSize;
            } catch (IOException e) {
                targetWidth = 30f;
            }

            String placeholder =
                    service.createPlaceholderWithWidth(original, targetWidth, font, fontSize);

            assertNotNull(placeholder);
            assertFalse(placeholder.isEmpty(), "Helvetica supports spaces, so non-empty expected");
            assertTrue(
                    placeholder.chars().allMatch(c -> c == ' '),
                    "placeholder should be composed only of spaces");
        }
    }

    // ── createTokensWithoutTargetText / writeFilteredContentStream
    // ────────────────────────────────

    @Nested
    @DisplayName("createTokensWithoutTargetText")
    class CreateTokensWithoutTargetText {

        @Test
        @DisplayName(
                "returns a non-empty token list and preserves token count when nothing matches")
        void noMatchPreservesTokens() throws IOException {
            try (PDDocument doc = buildDoc("nothing to hide")) {
                PDPage page = doc.getPage(0);
                List<Object> originalTokens = parseTokens(page);

                List<Object> tokens =
                        service.createTokensWithoutTargetText(
                                doc, page, Set.of("ABSENT"), false, false);

                assertNotNull(tokens);
                assertEquals(
                        originalTokens.size(),
                        tokens.size(),
                        "token count should be unchanged when nothing matched");
            }
        }

        @Test
        @DisplayName("filtered tokens can be written back and the page re-parses cleanly")
        void filteredTokensRoundTrip() throws IOException {
            try (PDDocument doc = buildDoc("redact SECRET token roundtrip")) {
                PDPage page = doc.getPage(0);

                List<Object> tokens =
                        service.createTokensWithoutTargetText(
                                doc, page, Set.of("SECRET"), false, false);
                assertNotNull(tokens);

                service.writeFilteredContentStream(doc, page, tokens);

                // The page must still hold valid content (at least one operator token).
                List<Object> reparsed = parseTokens(page);
                boolean hasOperator = reparsed.stream().anyMatch(t -> t instanceof Operator);
                assertTrue(hasOperator, "rewritten content stream must contain operators");
            }
        }

        @Test
        @DisplayName("empty target-word set leaves tokens untouched")
        void emptyTargetSetLeavesTokens() throws IOException {
            try (PDDocument doc = buildDoc("some content")) {
                PDPage page = doc.getPage(0);
                List<Object> originalTokens = parseTokens(page);

                List<Object> tokens =
                        service.createTokensWithoutTargetText(
                                doc, page, Collections.emptySet(), false, false);

                assertEquals(originalTokens.size(), tokens.size());
            }
        }

        private List<Object> parseTokens(PDPage page) throws IOException {
            PDFStreamParser parser = new PDFStreamParser(page);
            List<Object> tokens = new ArrayList<>();
            Object token;
            while ((token = parser.parseNextToken()) != null) {
                tokens.add(token);
            }
            return tokens;
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

    // ── private logic exercised via reflection ───────────────────────────────────────────────────

    @Nested
    @DisplayName("findAllMatches / buildCompleteText (private logic via reflection)")
    class PrivateLogic {

        @Test
        @DisplayName("findAllMatches returns sorted, non-overlapping match ranges for two terms")
        @SuppressWarnings("unchecked")
        void findAllMatchesSorted() throws Exception {
            String complete = "alpha beta gamma beta";
            Set<String> terms = new LinkedHashSet<>(List.of("beta", "alpha"));

            Method m =
                    TextRedactionService.class.getDeclaredMethod(
                            "findAllMatches",
                            String.class,
                            Set.class,
                            boolean.class,
                            boolean.class);
            m.setAccessible(true);
            List<TextRedactionService.MatchRange> matches =
                    (List<TextRedactionService.MatchRange>)
                            m.invoke(service, complete, terms, false, false);

            assertNotNull(matches);
            assertFalse(matches.isEmpty());
            // Results are sorted by start position.
            for (int i = 1; i < matches.size(); i++) {
                assertTrue(
                        matches.get(i - 1).getStartPos() <= matches.get(i).getStartPos(),
                        "matches must be sorted ascending by start position");
            }
            // "alpha" at 0, "beta" at 6 and 17 -> three matches total.
            assertEquals(3, matches.size());
            assertEquals(0, matches.get(0).getStartPos());
        }

        @Test
        @DisplayName("findAllMatches returns nothing when no term occurs")
        @SuppressWarnings("unchecked")
        void findAllMatchesEmptyWhenAbsent() throws Exception {
            Method m =
                    TextRedactionService.class.getDeclaredMethod(
                            "findAllMatches",
                            String.class,
                            Set.class,
                            boolean.class,
                            boolean.class);
            m.setAccessible(true);
            List<TextRedactionService.MatchRange> matches =
                    (List<TextRedactionService.MatchRange>)
                            m.invoke(service, "no terms here", Set.of("XYZ"), false, false);
            assertTrue(matches.isEmpty());
        }

        @Test
        @DisplayName("extractTextFromToken pulls text from Tj COSString and TJ COSArray")
        void extractTextFromToken() throws Exception {
            Method m =
                    TextRedactionService.class.getDeclaredMethod(
                            "extractTextFromToken", Object.class, String.class);
            m.setAccessible(true);

            assertEquals("hi", m.invoke(service, new COSString("hi"), "Tj"));
            assertEquals("hi", m.invoke(service, new COSString("hi"), "'"));

            COSArray tjArray = new COSArray();
            tjArray.add(new COSString("foo"));
            tjArray.add(new COSString("bar"));
            assertEquals("foobar", m.invoke(service, tjArray, "TJ"));

            // Unknown operator yields empty string.
            assertEquals("", m.invoke(service, new COSString("x"), "Td"));
            // Wrong token type for the operator yields empty string.
            assertEquals("", m.invoke(service, new COSArray(), "Tj"));
        }
    }
}
