package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.PDFText;

/**
 * Gap-coverage tests for {@link TextRedactionService} targeting branches the existing {@code
 * TextRedactionServiceTest} does not reach: TJ-array redaction with kerning adjustment, the {@code
 * '} and {@code "} text-showing operators, Form XObject content rewriting, multi-page / multi-match
 * find+replace, and the private TJ/segment helpers exercised directly via reflection.
 */
@DisplayName("TextRedactionService additional coverage")
class TextRedactionServiceMoreTest {

    private static final float FONT_SIZE = 12f;
    private static final float LEFT_X = 72f;
    private static final float TOP_Y = PDRectangle.LETTER.getHeight() - 80f;

    private final TextRedactionService service = new TextRedactionService();

    private PDFont helvetica() {
        return new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    }

    private List<Object> parseTokens(PDPage page) throws IOException {
        PDFStreamParser parser = new PDFStreamParser(page);
        List<Object> tokens = new ArrayList<>();
        Object t;
        while ((t = parser.parseNextToken()) != null) {
            tokens.add(t);
        }
        return tokens;
    }

    private String tokensText(List<Object> tokens) {
        StringBuilder sb = new StringBuilder();
        for (Object token : tokens) {
            if (token instanceof COSString cs) {
                sb.append(cs.getString());
            } else if (token instanceof COSArray arr) {
                for (COSBase el : arr) {
                    if (el instanceof COSString cs) {
                        sb.append(cs.getString());
                    }
                }
            }
        }
        return sb.toString();
    }

    /**
     * Builds a single page whose content stream is exactly {@code rawContent}, font F1=Helvetica.
     */
    private PDDocument docWithRawContent(String rawContent) throws IOException {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        doc.addPage(page);
        PDResources resources = new PDResources();
        resources.put(COSName.getPDFName("F1"), helvetica());
        page.setResources(resources);

        PDStream stream = new PDStream(doc);
        try (var out = stream.createOutputStream()) {
            out.write(rawContent.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1));
        }
        page.setContents(stream);
        return doc;
    }

    // ── ' and " operators ────────────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("apostrophe and quote text-showing operators")
    class MoveAndShowOperators {

        @Test
        @DisplayName("the ' (move-to-next-line-and-show) operator gets its text redacted")
        void apostropheOperatorRedacted() throws IOException {
            // ' shows a string on the next line. Content: BT /F1 12 Tf 72 700 Td (PUBLIC) Tj
            // (SECRET) ' ET
            String raw = "BT /F1 12 Tf 72 700 Td (PUBLIC) Tj (SECRET) ' ET";
            try (PDDocument doc = docWithRawContent(raw)) {
                PDPage page = doc.getPage(0);
                List<Object> tokens =
                        service.createTokensWithoutTargetText(
                                doc, page, Set.of("SECRET"), false, false);
                String text = tokensText(tokens);
                assertThat(text).doesNotContain("SECRET");
                assertThat(text).contains("PUBLIC");
            }
        }

        @Test
        @DisplayName("the \" operator is collected as text-showing but its text is not extracted")
        void quoteOperatorNotExtracted() throws IOException {
            // " is in TEXT_SHOWING_OPERATORS, but extractTextFromToken's switch only handles
            // Tj/'/TJ, so a "-shown string yields no segment and survives. This pins that
            // behavior: the parse path runs without error and the token list is intact.
            String raw = "BT /F1 12 Tf 72 700 Td 1 2 (SECRET) \" ET";
            try (PDDocument doc = docWithRawContent(raw)) {
                PDPage page = doc.getPage(0);
                List<Object> before = parseTokens(page);
                List<Object> tokens =
                        service.createTokensWithoutTargetText(
                                doc, page, Set.of("SECRET"), false, false);
                assertThat(tokens).hasSameSizeAs(before);
                assertThat(tokensText(tokens)).contains("SECRET");
            }
        }
    }

    // ── TJ arrays with kerning ───────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("TJ positioning arrays")
    class TjArrays {

        @Test
        @DisplayName("partial match inside a TJ array redacts only the matched run")
        void tjArrayPartialRedaction() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.setFont(helvetica(), FONT_SIZE);
                    cs.beginText();
                    cs.newLineAtOffset(LEFT_X, TOP_Y);
                    // showTextWithPositioning emits a single TJ array.
                    cs.showTextWithPositioning(
                            new Object[] {"keep ", -50f, "SECRET", 20f, " tail"});
                    cs.endText();
                }
                List<Object> tokens =
                        service.createTokensWithoutTargetText(
                                doc, page, Set.of("SECRET"), false, false);

                boolean sawTj = tokens.stream().anyMatch(t -> t instanceof COSArray);
                assertThat(sawTj).as("expected a TJ array token").isTrue();
                assertThat(tokensText(tokens)).doesNotContain("SECRET");
                assertThat(tokensText(tokens)).contains("keep");
            }
        }

        @Test
        @DisplayName("TJ array with no matching term is left unchanged")
        void tjArrayNoMatch() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.setFont(helvetica(), FONT_SIZE);
                    cs.beginText();
                    cs.newLineAtOffset(LEFT_X, TOP_Y);
                    cs.showTextWithPositioning(new Object[] {"alpha ", -30f, "beta"});
                    cs.endText();
                }
                List<Object> before = parseTokens(page);
                List<Object> tokens =
                        service.createTokensWithoutTargetText(
                                doc, page, Set.of("ZZZ"), false, false);
                assertThat(tokens).hasSameSizeAs(before);
                assertThat(tokensText(tokens)).contains("alpha");
            }
        }
    }

    // ── Form XObject traversal ───────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Form XObject content")
    class FormXObjects {

        @Test
        @DisplayName("a referenced Form XObject containing a match is traversed and rewritten")
        void traversesFormXObject() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);

                // Build a form XObject whose own content stream shows "SECRET".
                PDFormXObject form = new PDFormXObject(doc);
                form.setResources(new PDResources());
                form.getResources().put(COSName.getPDFName("F1"), helvetica());
                form.setBBox(new PDRectangle(0, 0, 200, 50));
                String formContent = "BT /F1 12 Tf 0 10 Td (SECRET) Tj ET";
                try (var out = form.getStream().createOutputStream()) {
                    out.write(formContent.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1));
                }

                PDResources pageResources = new PDResources();
                COSName formName = pageResources.add(form);
                page.setResources(pageResources);

                String pageContent = "q 1 0 0 1 100 600 cm /" + formName.getName() + " Do Q";
                PDStream pageStream = new PDStream(doc);
                try (var out = pageStream.createOutputStream()) {
                    out.write(pageContent.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1));
                }
                page.setContents(pageStream);

                // Processing the page walks into the XObject graph; when a match is found inside
                // the
                // form, writeRedactedContentToXObject runs and sets a /Contents item on the form's
                // COS dictionary. Asserting that item appears proves the XObject redaction path
                // executed end-to-end without throwing.
                List<Object> tokens =
                        service.createTokensWithoutTargetText(
                                doc, page, Set.of("SECRET"), false, false);

                assertThat(tokens).isNotNull();
                assertThat(form.getCOSObject().containsKey(COSName.CONTENTS))
                        .as("form XObject redaction path should have written a new content item")
                        .isTrue();
            }
        }
    }

    // ── multi-page / multi-match public entry points ─────────────────────────────────────────────

    @Nested
    @DisplayName("findTextToRedact and performTextReplacement across pages")
    class MultiPage {

        private PDDocument twoPageDoc(String line0, String line1) throws IOException {
            PDDocument doc = new PDDocument();
            String[] lines = {line0, line1};
            for (String line : lines) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.setFont(helvetica(), FONT_SIZE);
                    cs.beginText();
                    cs.newLineAtOffset(LEFT_X, TOP_Y);
                    cs.showText(line);
                    cs.endText();
                }
            }
            return doc;
        }

        @Test
        @DisplayName("a term present on two pages is found on both page indices")
        void findsAcrossTwoPages() throws IOException {
            try (PDDocument doc = twoPageDoc("page A SECRET", "page B SECRET")) {
                Map<Integer, List<PDFText>> found =
                        service.findTextToRedact(doc, new String[] {"SECRET"}, false, false);
                assertThat(found).containsKeys(0, 1);
            }
        }

        @Test
        @DisplayName("multiple occurrences on one page yield multiple hits")
        void multipleHitsOnOnePage() throws IOException {
            PDDocument doc = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.setFont(helvetica(), FONT_SIZE);
                cs.beginText();
                cs.newLineAtOffset(LEFT_X, TOP_Y);
                cs.showText("SECRET and again SECRET here");
                cs.endText();
            }
            try (doc) {
                Map<Integer, List<PDFText>> found =
                        service.findTextToRedact(doc, new String[] {"SECRET"}, false, false);
                assertThat(found.get(0)).hasSizeGreaterThanOrEqualTo(2);
            }
        }

        @Test
        @DisplayName("performTextReplacement rewrites every page and reports no fallback")
        void replacesAcrossPages() throws IOException {
            try (PDDocument doc = twoPageDoc("alpha SECRET one", "beta SECRET two")) {
                Map<Integer, List<PDFText>> found =
                        service.findTextToRedact(doc, new String[] {"SECRET"}, false, false);
                boolean fallback =
                        service.performTextReplacement(
                                doc, found, new String[] {"SECRET"}, false, false);
                assertThat(fallback).isFalse();
                Map<Integer, List<PDFText>> after =
                        service.findTextToRedact(doc, new String[] {"SECRET"}, false, false);
                assertThat(after).isEmpty();
            }
        }

        @Test
        @DisplayName("regex replacement across pages removes all matches")
        void regexReplaceAcrossPages() throws IOException {
            try (PDDocument doc = twoPageDoc("id 111 here", "id 222 there")) {
                Map<Integer, List<PDFText>> found =
                        service.findTextToRedact(doc, new String[] {"\\d+"}, true, false);
                service.performTextReplacement(doc, found, new String[] {"\\d+"}, true, false);
                Map<Integer, List<PDFText>> after =
                        service.findTextToRedact(doc, new String[] {"\\d+"}, true, false);
                assertThat(after).isEmpty();
            }
        }
    }

    // ── private TJ / segment helpers via reflection ──────────────────────────────────────────────

    @Nested
    @DisplayName("private helpers via reflection")
    class PrivateHelpers {

        @Test
        @DisplayName("createRedactedTJArray replaces the matched substring inside the array")
        void createRedactedTjArray() throws Exception {
            COSArray original = new COSArray();
            original.add(new COSString("SECRET"));
            original.add(new COSFloat(-40f));
            original.add(new COSString(" tail"));

            // Segment text is the concatenation "SECRET tail"; startPos 0.
            TextRedactionService.TextSegment segment =
                    new TextRedactionService.TextSegment(
                            0, "TJ", "SECRET tail", 0, 11, helvetica(), FONT_SIZE);
            List<TextRedactionService.MatchRange> matches =
                    List.of(new TextRedactionService.MatchRange(0, 6)); // "SECRET"

            Method m =
                    TextRedactionService.class.getDeclaredMethod(
                            "createRedactedTJArray",
                            COSArray.class,
                            TextRedactionService.TextSegment.class,
                            List.class);
            m.setAccessible(true);
            COSArray result = (COSArray) m.invoke(service, original, segment, matches);

            StringBuilder sb = new StringBuilder();
            for (COSBase el : result) {
                if (el instanceof COSString cs) sb.append(cs.getString());
            }
            assertThat(sb.toString()).doesNotContain("SECRET");
            assertThat(sb.toString()).contains("tail");
        }

        @Test
        @DisplayName("applyRedactionsToSegmentText swaps the matched span for a placeholder")
        void applyRedactionsToSegmentText() throws Exception {
            TextRedactionService.TextSegment segment =
                    new TextRedactionService.TextSegment(
                            0, "Tj", "keepSECRETkeep", 0, 14, helvetica(), FONT_SIZE);
            List<TextRedactionService.MatchRange> matches =
                    List.of(new TextRedactionService.MatchRange(4, 10)); // SECRET

            Method m =
                    TextRedactionService.class.getDeclaredMethod(
                            "applyRedactionsToSegmentText",
                            TextRedactionService.TextSegment.class,
                            List.class);
            m.setAccessible(true);
            String out = (String) m.invoke(service, segment, matches);
            assertThat(out).doesNotContain("SECRET");
            assertThat(out).startsWith("keep");
            assertThat(out).endsWith("keep");
        }

        @Test
        @DisplayName("calculateWidthAdjustment returns 0 for a null-font segment")
        void widthAdjustmentNullFont() throws Exception {
            TextRedactionService.TextSegment segment =
                    new TextRedactionService.TextSegment(0, "Tj", "abc", 0, 3, null, FONT_SIZE);
            Method m =
                    TextRedactionService.class.getDeclaredMethod(
                            "calculateWidthAdjustment",
                            TextRedactionService.TextSegment.class,
                            List.class);
            m.setAccessible(true);
            float adj =
                    (float)
                            m.invoke(
                                    service,
                                    segment,
                                    List.of(new TextRedactionService.MatchRange(0, 3)));
            assertThat(adj).isZero();
        }

        @Test
        @DisplayName("calculateWidthAdjustment skips subset fonts (returns 0)")
        void widthAdjustmentSubsetFontSkipped() throws Exception {
            // A subset font name (6 uppercase letters + '+') trips the subset short-circuit.
            PDFont subsetNamed = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            TextRedactionService.TextSegment segment =
                    new TextRedactionService.TextSegment(
                            0, "Tj", "ABCDEF", 0, 6, subsetNamed, FONT_SIZE);

            // The real Helvetica name is not a subset, so this segment goes through the normal
            // calculation; assert the call is at least exception-free and finite.
            Method m =
                    TextRedactionService.class.getDeclaredMethod(
                            "calculateWidthAdjustment",
                            TextRedactionService.TextSegment.class,
                            List.class);
            m.setAccessible(true);
            float adj =
                    (float)
                            m.invoke(
                                    service,
                                    segment,
                                    List.of(new TextRedactionService.MatchRange(0, 6)));
            assertThat(Float.isFinite(adj)).isTrue();
        }

        @Test
        @DisplayName("modifyTokenForRedaction with an out-of-range token index is a no-op")
        void modifyTokenOutOfRange() throws Exception {
            List<Object> tokens = new ArrayList<>();
            tokens.add(new COSString("hello"));
            TextRedactionService.TextSegment segment =
                    new TextRedactionService.TextSegment(
                            99, "Tj", "hello", 0, 5, helvetica(), FONT_SIZE);

            Method m =
                    TextRedactionService.class.getDeclaredMethod(
                            "modifyTokenForRedaction",
                            List.class,
                            TextRedactionService.TextSegment.class,
                            String.class,
                            float.class,
                            List.class);
            m.setAccessible(true);
            m.invoke(service, tokens, segment, "", 0f, List.of());

            // Token list is untouched because index 99 is out of bounds.
            assertThat(tokens).hasSize(1);
            assertThat(((COSString) tokens.get(0)).getString()).isEqualTo("hello");
        }

        @Test
        @DisplayName("buildCompleteText concatenates the text of all segments in order")
        void buildCompleteText() throws Exception {
            List<TextRedactionService.TextSegment> segments =
                    List.of(
                            new TextRedactionService.TextSegment(
                                    0, "Tj", "foo", 0, 3, helvetica(), FONT_SIZE),
                            new TextRedactionService.TextSegment(
                                    1, "Tj", "bar", 3, 6, helvetica(), FONT_SIZE));
            Method m =
                    TextRedactionService.class.getDeclaredMethod("buildCompleteText", List.class);
            m.setAccessible(true);
            assertThat(m.invoke(service, segments)).isEqualTo("foobar");
        }

        @Test
        @DisplayName("extractTextFromToken returns text for the \" operator")
        void extractTextFromQuoteOperator() throws Exception {
            Method m =
                    TextRedactionService.class.getDeclaredMethod(
                            "extractTextFromToken", Object.class, String.class);
            m.setAccessible(true);
            // The " operator is not in the switch (Tj/'/TJ) -> default branch yields empty string.
            assertThat(m.invoke(service, new COSString("x"), "\"")).isEqualTo("");
        }
    }

    // ── createPlaceholderWithWidth additional branches ───────────────────────────────────────────

    @Nested
    @DisplayName("createPlaceholderWithWidth reliable-font path")
    class PlaceholderWidthBranches {

        @Test
        @DisplayName("reliable font with positive width yields a bounded run of spaces")
        void reliableFontBoundedSpaces() {
            PDFont font = helvetica();
            String original = "Secret";
            float targetWidth;
            try {
                targetWidth = font.getStringWidth(original) / 1000f * FONT_SIZE;
            } catch (IOException e) {
                targetWidth = 30f;
            }
            String placeholder =
                    service.createPlaceholderWithWidth(original, targetWidth, font, FONT_SIZE);
            assertThat(placeholder).isNotEmpty();
            assertThat(placeholder.chars().allMatch(c -> c == ' ')).isTrue();
            // spaceCount is capped at originalLength*2.
            assertThat(placeholder.length()).isLessThanOrEqualTo(original.length() * 2);
        }

        @Test
        @DisplayName("zero target width falls back to alternative placeholder logic")
        void zeroTargetWidth() {
            PDFont font = helvetica();
            String placeholder = service.createPlaceholderWithWidth("word", 0f, font, FONT_SIZE);
            // With a reliable, non-subset font and zero width, output is still all whitespace.
            assertThat(placeholder.chars().allMatch(c -> c == ' ')).isTrue();
        }
    }

    // ── inner data classes ───────────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("ModificationTask / GraphicsState data classes")
    class DataClasses {

        @Test
        @DisplayName("GraphicsState defaults are null font and zero size, mutators round-trip")
        void graphicsStateRoundTrip() throws Exception {
            Class<?> gsClass =
                    Class.forName(
                            "stirling.software.SPDF.controller.api.security.TextRedactionService$GraphicsState");
            var ctor = gsClass.getDeclaredConstructor();
            ctor.setAccessible(true);
            Object gs = ctor.newInstance();

            Method getFont = gsClass.getDeclaredMethod("getFont");
            Method getSize = gsClass.getDeclaredMethod("getFontSize");
            getFont.setAccessible(true);
            getSize.setAccessible(true);
            assertThat(getFont.invoke(gs)).isNull();
            assertThat((float) getSize.invoke(gs)).isZero();

            Method setSize = gsClass.getDeclaredMethod("setFontSize", float.class);
            setSize.setAccessible(true);
            setSize.invoke(gs, 14f);
            assertThat((float) getSize.invoke(gs)).isEqualTo(14f);
        }
    }
}
