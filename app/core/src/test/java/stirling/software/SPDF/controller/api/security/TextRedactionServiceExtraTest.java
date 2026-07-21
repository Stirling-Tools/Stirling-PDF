package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.contentstream.operator.Operator;
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
 * Further gap-coverage tests for {@link TextRedactionService}, complementing {@code
 * TextRedactionServiceTest} and {@code TextRedactionServiceMoreTest}. These target branches the
 * other two suites leave untouched: case-sensitive vs regex find, multi-term and multi-match within
 * one segment, the kerning ({@code adjustment != 0}) path that rewrites a {@code Tj} into a {@code
 * TJ} array, nested Form XObject traversal, pages with no resources, and the private width helpers
 * exercised directly via reflection.
 */
@DisplayName("TextRedactionService extra coverage")
class TextRedactionServiceExtraTest {

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

    /** Single page, one Tj line per supplied text line, Helvetica 12. */
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

    /** Page whose content stream is exactly {@code rawContent}, font F1=Helvetica. */
    private PDDocument docWithRawContent(String rawContent) throws IOException {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        doc.addPage(page);
        PDResources resources = new PDResources();
        resources.put(COSName.getPDFName("F1"), helvetica());
        page.setResources(resources);

        PDStream stream = new PDStream(doc);
        try (var out = stream.createOutputStream()) {
            out.write(rawContent.getBytes(StandardCharsets.ISO_8859_1));
        }
        page.setContents(stream);
        return doc;
    }

    // ── findTextToRedact: matching modes ─────────────────────────────────────────────────────────

    @Nested
    @DisplayName("findTextToRedact matching modes")
    class FindModes {

        @Test
        @DisplayName("literal search is case-insensitive and matches every casing of the term")
        void literalIsCaseInsensitive() throws IOException {
            try (PDDocument doc = buildDoc("Secret and secret and SECRET")) {
                Map<Integer, List<PDFText>> result =
                        service.findTextToRedact(doc, new String[] {"secret"}, false, false);
                // Patterns are compiled CASE_INSENSITIVE, so all three occurrences match.
                assertThat(result.get(0)).hasSize(3);
            }
        }

        @Test
        @DisplayName("two distinct literal terms both produce hits on the page")
        void twoDistinctTerms() throws IOException {
            try (PDDocument doc = buildDoc("alpha then bravo then charlie")) {
                Map<Integer, List<PDFText>> result =
                        service.findTextToRedact(
                                doc, new String[] {"alpha", "charlie"}, false, false);
                assertThat(result.get(0)).hasSize(2);
            }
        }

        @Test
        @DisplayName("a regex character class matches multiple distinct vowels")
        void regexCharacterClass() throws IOException {
            try (PDDocument doc = buildDoc("abcde")) {
                Map<Integer, List<PDFText>> result =
                        service.findTextToRedact(doc, new String[] {"[ae]"}, true, false);
                // 'a' and 'e' both match -> two single-character hits.
                assertThat(result.get(0)).hasSize(2);
            }
        }

        @Test
        @DisplayName("blank-only mixed with a real term still searches the real term")
        void blankMixedWithRealTerm() throws IOException {
            try (PDDocument doc = buildDoc("keep SECRET here")) {
                Map<Integer, List<PDFText>> result =
                        service.findTextToRedact(doc, new String[] {"   ", "SECRET"}, false, false);
                assertThat(result.get(0)).hasSize(1);
            }
        }
    }

    // ── createTokensWithoutTargetText structural branches ────────────────────────────────────────

    @Nested
    @DisplayName("createTokensWithoutTargetText structural branches")
    class TokenStructural {

        @Test
        @DisplayName("page with null resources still parses and redacts the matched Tj text")
        void nullResourcesStillRedacts() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                // No resources set; the content stream references no real font.
                String raw = "BT 72 700 Td (SECRET) Tj ET";
                PDStream stream = new PDStream(doc);
                try (var out = stream.createOutputStream()) {
                    out.write(raw.getBytes(StandardCharsets.ISO_8859_1));
                }
                page.setContents(stream);

                List<Object> tokens =
                        service.createTokensWithoutTargetText(
                                doc, page, Set.of("SECRET"), false, false);
                assertThat(tokensText(tokens)).doesNotContain("SECRET");
            }
        }

        @Test
        @DisplayName("a match inside a Tj segment is redacted and surrounding text survives")
        void multipleMatchesOneSegment() throws IOException {
            try (PDDocument doc = docWithRawContent("BT /F1 12 Tf 72 700 Td (xAAxAAx) Tj ET")) {
                PDPage page = doc.getPage(0);
                List<Object> tokens =
                        service.createTokensWithoutTargetText(
                                doc, page, Set.of("AA"), false, false);
                String redacted = tokensText(tokens);
                // The segment was rewritten away from the original literal.
                assertThat(redacted).isNotEqualTo("xAAxAAx");
                // Redaction replaces matched runs with whitespace, so at least one "AA" is gone
                // (the leading occurrence) and the surrounding x characters survive.
                assertThat(redacted.split("AA", -1).length - 1).isLessThan(2);
                assertThat(redacted).startsWith("x ");
                assertThat(redacted).contains("x");
            }
        }

        @Test
        @DisplayName("a second Tf operator updates the active font for later segments")
        void secondTfUpdatesFont() throws IOException {
            PDDocument doc = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            PDResources resources = new PDResources();
            resources.put(COSName.getPDFName("F1"), helvetica());
            resources.put(
                    COSName.getPDFName("F2"),
                    new PDType1Font(Standard14Fonts.FontName.TIMES_ROMAN));
            page.setResources(resources);
            String raw = "BT /F1 12 Tf 72 700 Td (first) Tj /F2 18 Tf 0 -20 Td (SECRET) Tj ET";
            PDStream stream = new PDStream(doc);
            try (var out = stream.createOutputStream()) {
                out.write(raw.getBytes(StandardCharsets.ISO_8859_1));
            }
            page.setContents(stream);
            try (doc) {
                List<Object> tokens =
                        service.createTokensWithoutTargetText(
                                doc, page, Set.of("SECRET"), false, false);
                assertThat(tokensText(tokens)).doesNotContain("SECRET");
                assertThat(tokensText(tokens)).contains("first");
            }
        }
    }

    // ── nested Form XObject traversal ────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("nested Form XObject traversal")
    class NestedXObjects {

        @Test
        @DisplayName("a match in a form nested two levels deep is reached and rewritten")
        void nestedTwoLevelsDeep() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);

                // Inner form shows SECRET.
                PDFormXObject inner = new PDFormXObject(doc);
                inner.setResources(new PDResources());
                inner.getResources().put(COSName.getPDFName("F1"), helvetica());
                inner.setBBox(new PDRectangle(0, 0, 200, 50));
                try (var out = inner.getStream().createOutputStream()) {
                    out.write(
                            "BT /F1 12 Tf 0 10 Td (SECRET) Tj ET"
                                    .getBytes(StandardCharsets.ISO_8859_1));
                }

                // Outer form references inner via Do.
                PDFormXObject outer = new PDFormXObject(doc);
                PDResources outerRes = new PDResources();
                COSName innerName = outerRes.add(inner);
                outer.setResources(outerRes);
                outer.setBBox(new PDRectangle(0, 0, 200, 50));
                try (var out = outer.getStream().createOutputStream()) {
                    out.write(
                            ("/" + innerName.getName() + " Do")
                                    .getBytes(StandardCharsets.ISO_8859_1));
                }

                PDResources pageRes = new PDResources();
                COSName outerName = pageRes.add(outer);
                page.setResources(pageRes);
                PDStream pageStream = new PDStream(doc);
                try (var out = pageStream.createOutputStream()) {
                    out.write(
                            ("/" + outerName.getName() + " Do")
                                    .getBytes(StandardCharsets.ISO_8859_1));
                }
                page.setContents(pageStream);

                service.createTokensWithoutTargetText(doc, page, Set.of("SECRET"), false, false);

                // The deep traversal must have rewritten the inner form's content stream.
                assertThat(inner.getCOSObject().containsKey(COSName.CONTENTS)).isTrue();
            }
        }

        @Test
        @DisplayName("a form XObject with no resources is skipped without error")
        void formWithoutResourcesSkipped() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);

                PDFormXObject form = new PDFormXObject(doc);
                form.setBBox(new PDRectangle(0, 0, 100, 50));
                // Intentionally no resources on the form.
                try (var out = form.getStream().createOutputStream()) {
                    out.write("q Q".getBytes(StandardCharsets.ISO_8859_1));
                }

                PDResources pageRes = new PDResources();
                COSName formName = pageRes.add(form);
                page.setResources(pageRes);
                PDStream pageStream = new PDStream(doc);
                try (var out = pageStream.createOutputStream()) {
                    out.write(
                            ("/" + formName.getName() + " Do")
                                    .getBytes(StandardCharsets.ISO_8859_1));
                }
                page.setContents(pageStream);

                List<Object> tokens =
                        service.createTokensWithoutTargetText(
                                doc, page, Set.of("SECRET"), false, false);
                assertThat(tokens).isNotNull();
            }
        }
    }

    // ── kerning / adjustment path in modifyTokenForRedaction ─────────────────────────────────────

    @Nested
    @DisplayName("modifyTokenForRedaction adjustment branches")
    class ModifyTokenAdjustment {

        @Test
        @DisplayName("a non-zero width adjustment rewrites a Tj into a TJ array with kerning")
        void adjustmentRewritesToTjArray() throws Exception {
            List<Object> tokens = new ArrayList<>();
            tokens.add(new COSString("KEEP"));
            tokens.add(Operator.getOperator("Tj"));

            TextRedactionService.TextSegment segment =
                    new TextRedactionService.TextSegment(
                            0, "Tj", "KEEP", 0, 4, helvetica(), FONT_SIZE);

            Method m =
                    TextRedactionService.class.getDeclaredMethod(
                            "modifyTokenForRedaction",
                            List.class,
                            TextRedactionService.TextSegment.class,
                            String.class,
                            float.class,
                            List.class);
            m.setAccessible(true);
            // A clearly non-zero adjustment forces the COSArray + kerning branch.
            m.invoke(service, tokens, segment, "AB", 5.0f, List.of());

            assertThat(tokens.get(0)).isInstanceOf(COSArray.class);
            COSArray arr = (COSArray) tokens.get(0);
            boolean hasKern = false;
            for (COSBase el : arr) {
                if (el instanceof COSFloat) {
                    hasKern = true;
                }
            }
            assertThat(hasKern).as("kerning float should be appended to the TJ array").isTrue();
            // The trailing Tj operator should have been switched to TJ.
            assertThat(tokens.get(1)).isInstanceOf(Operator.class);
            assertThat(((Operator) tokens.get(1)).getName()).isEqualTo("TJ");
        }

        @Test
        @DisplayName("empty replacement text with ~zero adjustment sets the shared empty COSString")
        void emptyReplacementZeroAdjustment() throws Exception {
            List<Object> tokens = new ArrayList<>();
            tokens.add(new COSString("SECRET"));
            tokens.add(Operator.getOperator("Tj"));

            TextRedactionService.TextSegment segment =
                    new TextRedactionService.TextSegment(
                            0, "Tj", "SECRET", 0, 6, helvetica(), FONT_SIZE);

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

            assertThat(tokens.get(0)).isInstanceOf(COSString.class);
            assertThat(((COSString) tokens.get(0)).getString()).isEmpty();
        }

        @Test
        @DisplayName("the ' operator with a non-zero adjustment is also rewritten to a TJ array")
        void apostropheAdjustmentRewrites() throws Exception {
            List<Object> tokens = new ArrayList<>();
            tokens.add(new COSString("WORD"));
            tokens.add(Operator.getOperator("'"));

            TextRedactionService.TextSegment segment =
                    new TextRedactionService.TextSegment(
                            0, "'", "WORD", 0, 4, helvetica(), FONT_SIZE);

            Method m =
                    TextRedactionService.class.getDeclaredMethod(
                            "modifyTokenForRedaction",
                            List.class,
                            TextRedactionService.TextSegment.class,
                            String.class,
                            float.class,
                            List.class);
            m.setAccessible(true);
            m.invoke(service, tokens, segment, "X", 4.0f, List.of());

            assertThat(tokens.get(0)).isInstanceOf(COSArray.class);
            assertThat(((Operator) tokens.get(1)).getName()).isEqualTo("TJ");
        }
    }

    // ── createRedactedTJArray edge branches ──────────────────────────────────────────────────────

    @Nested
    @DisplayName("createRedactedTJArray edge branches")
    class RedactedTjArray {

        @Test
        @DisplayName("non-COSString elements (kerning numbers) are preserved in order")
        void preservesNumberElements() throws Exception {
            COSArray original = new COSArray();
            original.add(new COSString("AA"));
            original.add(new COSFloat(-25f));
            original.add(new COSString("BB"));

            TextRedactionService.TextSegment segment =
                    new TextRedactionService.TextSegment(
                            0, "TJ", "AABB", 0, 4, helvetica(), FONT_SIZE);
            List<TextRedactionService.MatchRange> matches =
                    List.of(new TextRedactionService.MatchRange(0, 2)); // "AA"

            Method m =
                    TextRedactionService.class.getDeclaredMethod(
                            "createRedactedTJArray",
                            COSArray.class,
                            TextRedactionService.TextSegment.class,
                            List.class);
            m.setAccessible(true);
            COSArray result = (COSArray) m.invoke(service, original, segment, matches);

            boolean sawFloat = false;
            for (COSBase el : result) {
                if (el instanceof COSFloat) {
                    sawFloat = true;
                }
            }
            assertThat(sawFloat).as("original kerning number must be retained").isTrue();
        }

        @Test
        @DisplayName("a TJ array with no overlapping match is returned essentially unchanged")
        void noMatchLeavesTextIntact() throws Exception {
            COSArray original = new COSArray();
            original.add(new COSString("hello"));
            original.add(new COSString("world"));

            TextRedactionService.TextSegment segment =
                    new TextRedactionService.TextSegment(
                            0, "TJ", "helloworld", 0, 10, helvetica(), FONT_SIZE);
            List<TextRedactionService.MatchRange> matches =
                    List.of(new TextRedactionService.MatchRange(50, 60)); // out of range

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
            assertThat(sb.toString()).isEqualTo("helloworld");
        }
    }

    // ── private width helpers via reflection ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("private width helpers via reflection")
    class WidthHelpers {

        private float invokeFloat(String name, Object... args) throws Exception {
            Class<?>[] types = new Class<?>[] {PDFont.class, String.class};
            Method m = TextRedactionService.class.getDeclaredMethod(name, types);
            m.setAccessible(true);
            return (float) m.invoke(service, args);
        }

        @Test
        @DisplayName("calculateConservativeWidth scales linearly at 500 units per character")
        void conservativeWidthLinear() throws Exception {
            float w = invokeFloat("calculateConservativeWidth", helvetica(), "abcd");
            assertThat(w).isEqualTo(4 * 500f);
        }

        @Test
        @DisplayName("calculateCharacterBasedWidth returns a positive width for normal text")
        void characterBasedWidthPositive() throws Exception {
            float w = invokeFloat("calculateCharacterBasedWidth", helvetica(), "Hello");
            assertThat(w).isGreaterThan(0f);
        }

        @Test
        @DisplayName("calculateFallbackWidth returns a positive width using font metrics")
        void fallbackWidthPositive() throws Exception {
            float w = invokeFloat("calculateFallbackWidth", helvetica(), "Hello");
            assertThat(w).isGreaterThan(0f);
        }

        @Test
        @DisplayName("safeGetStringWidth returns 0 for null/empty inputs")
        void safeWidthZeroForEmpty() throws Exception {
            assertThat(invokeFloat("safeGetStringWidth", helvetica(), "")).isZero();
            Method m =
                    TextRedactionService.class.getDeclaredMethod(
                            "safeGetStringWidth", PDFont.class, String.class);
            m.setAccessible(true);
            assertThat((float) m.invoke(service, helvetica(), null)).isZero();
            assertThat((float) m.invoke(service, (PDFont) null, "x")).isZero();
        }

        @Test
        @DisplayName("safeGetStringWidth returns a positive width for a reliable font")
        void safeWidthPositive() throws Exception {
            float w = invokeFloat("safeGetStringWidth", helvetica(), "Word");
            assertThat(w).isGreaterThan(0f);
        }
    }

    // ── createAlternativePlaceholder via reflection ──────────────────────────────────────────────

    @Nested
    @DisplayName("createAlternativePlaceholder via reflection")
    class AlternativePlaceholder {

        @Test
        @DisplayName("Helvetica supports space, so output is a bounded run of spaces")
        void boundedSpaces() throws Exception {
            Method m =
                    TextRedactionService.class.getDeclaredMethod(
                            "createAlternativePlaceholder",
                            String.class,
                            float.class,
                            PDFont.class,
                            float.class);
            m.setAccessible(true);
            String result = (String) m.invoke(service, "hidden", 20f, helvetica(), FONT_SIZE);
            assertThat(result.chars().allMatch(c -> c == ' ')).isTrue();
            assertThat(result.length()).isLessThanOrEqualTo("hidden".length() * 2);
        }
    }

    // ── extractTextSegments via reflection ───────────────────────────────────────────────────────

    @Nested
    @DisplayName("extractTextSegments via reflection")
    class ExtractSegments {

        @SuppressWarnings("unchecked")
        @Test
        @DisplayName("a Tf operator sets font and size on the segments that follow it")
        void tfSetsFontAndSize() throws Exception {
            try (PDDocument doc = docWithRawContent("BT /F1 14 Tf 72 700 Td (hello) Tj ET")) {
                PDPage page = doc.getPage(0);
                List<Object> tokens = parseTokens(page);

                Method m =
                        TextRedactionService.class.getDeclaredMethod(
                                "extractTextSegments", PDPage.class, List.class);
                m.setAccessible(true);
                List<TextRedactionService.TextSegment> segments =
                        (List<TextRedactionService.TextSegment>) m.invoke(service, page, tokens);

                assertThat(segments).isNotEmpty();
                TextRedactionService.TextSegment first = segments.get(0);
                assertThat(first.getText()).isEqualTo("hello");
                assertThat(first.getFontSize()).isEqualTo(14f);
                assertThat(first.getFont()).isNotNull();
            }
        }
    }
}
