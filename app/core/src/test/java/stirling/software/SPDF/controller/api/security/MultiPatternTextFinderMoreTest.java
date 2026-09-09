package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.PDFText;

/**
 * Additional coverage for {@link MultiPatternTextFinder} driving real PDFBox documents: multi-page
 * accumulation, multi-line text, case-sensitivity, and the empty/whitespace page short-circuit.
 */
class MultiPatternTextFinderMoreTest {

    private static void writeLine(PDPageContentStream cs, String text, float x, float y)
            throws IOException {
        cs.beginText();
        cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
        cs.newLineAtOffset(x, y);
        cs.showText(text);
        cs.endText();
    }

    private static PDPage pageWith(PDDocument doc, String text) throws IOException {
        PDPage page = new PDPage(PDRectangle.A4);
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            writeLine(cs, text, 50, 700);
        }
        return page;
    }

    private static Map<Integer, List<PDFText>> scan(PDDocument doc, List<Pattern> patterns)
            throws IOException {
        MultiPatternTextFinder finder = new MultiPatternTextFinder(patterns);
        finder.setStartPage(1);
        finder.setEndPage(doc.getNumberOfPages());
        finder.getText(doc);
        return finder.getFoundTextsByPage();
    }

    @Nested
    @DisplayName("multi-page documents")
    class MultiPage {

        @Test
        @DisplayName("matches are keyed by their zero-based page index")
        void matchesKeyedByPage() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                pageWith(doc, "first apple");
                pageWith(doc, "second apple");
                pageWith(doc, "third nothing");

                Map<Integer, List<PDFText>> result = scan(doc, List.of(Pattern.compile("apple")));

                assertThat(result).containsOnlyKeys(0, 1);
                assertThat(result.get(0)).hasSize(1);
                assertThat(result.get(1)).hasSize(1);
                assertThat(result.get(0).get(0).getPageIndex()).isZero();
                assertThat(result.get(1).get(0).getPageIndex()).isEqualTo(1);
            }
        }

        @Test
        @DisplayName("each pattern is searched independently across every page")
        void everyPatternEveryPage() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                pageWith(doc, "alpha beta");
                pageWith(doc, "beta gamma");

                Map<Integer, List<PDFText>> result =
                        scan(doc, List.of(Pattern.compile("alpha"), Pattern.compile("beta")));

                // page 0 has alpha + beta, page 1 has beta only
                assertThat(result.get(0)).hasSize(2);
                assertThat(result.get(1)).hasSize(1);
            }
        }
    }

    @Nested
    @DisplayName("text shape")
    class TextShape {

        @Test
        @DisplayName("a match spanning a word separator still yields one positioned hit")
        void matchAcrossWordSeparator() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                pageWith(doc, "hello world");

                // the space between the words is a null TextPosition slot
                Map<Integer, List<PDFText>> result =
                        scan(doc, List.of(Pattern.compile("hello world")));

                assertThat(result.get(0)).hasSize(1);
                PDFText hit = result.get(0).get(0);
                assertThat(hit.getText()).isEqualTo("hello world");
                assertThat(hit.getX2()).isGreaterThan(hit.getX1());
            }
        }

        @Test
        @DisplayName("a multi-line page can match terms on separate lines")
        void multiLineMatches() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.A4);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    writeLine(cs, "needle one", 50, 720);
                    writeLine(cs, "needle two", 50, 680);
                }

                Map<Integer, List<PDFText>> result = scan(doc, List.of(Pattern.compile("needle")));

                assertThat(result.get(0)).hasSize(2);
            }
        }

        @Test
        @DisplayName("matching is case sensitive by default")
        void caseSensitive() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                pageWith(doc, "Apple apple");

                Map<Integer, List<PDFText>> result = scan(doc, List.of(Pattern.compile("apple")));

                // only the lowercase occurrence matches
                assertThat(result.get(0)).hasSize(1);
            }
        }

        @Test
        @DisplayName("case-insensitive flag matches both casings")
        void caseInsensitiveFlag() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                pageWith(doc, "Apple apple");

                Map<Integer, List<PDFText>> result =
                        scan(doc, List.of(Pattern.compile("apple", Pattern.CASE_INSENSITIVE)));

                assertThat(result.get(0)).hasSize(2);
            }
        }
    }

    @Nested
    @DisplayName("empty content")
    class EmptyContent {

        @Test
        @DisplayName("a page with no content stream produces no matches")
        void blankPageNoMatch() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage(PDRectangle.A4));

                Map<Integer, List<PDFText>> result =
                        scan(doc, List.of(Pattern.compile("anything")));

                assertThat(result).isEmpty();
            }
        }

        @Test
        @DisplayName("an empty pattern list never matches anything")
        void emptyPatternList() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                pageWith(doc, "some text here");

                Map<Integer, List<PDFText>> result = scan(doc, List.of());

                assertThat(result).isEmpty();
            }
        }
    }
}
