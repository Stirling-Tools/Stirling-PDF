package stirling.software.SPDF.pdf;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.PDFText;

/**
 * Additional branch coverage for {@link TextFinder} over real in-memory PDFs. Focuses on branches
 * the primary TextFinderTest leaves untouched: literal escaping of regex metacharacters, the
 * search-term trim path, multi-line single-char whole-word, getDebugInfo, and getFoundTexts
 * accumulation across repeated runs.
 */
@DisplayName("TextFinder additional branch tests")
class TextFinderMoreTest {

    private PDDocument document;
    private PDPage page;

    @BeforeEach
    void setUp() {
        document = new PDDocument();
        page = new PDPage(PDRectangle.A4);
        document.addPage(page);
    }

    @AfterEach
    void tearDown() throws IOException {
        if (document != null) {
            document.close();
        }
    }

    private void addText(String text) throws IOException {
        addText(page, text);
    }

    private void addText(PDPage target, String text) throws IOException {
        try (PDPageContentStream cs = new PDPageContentStream(document, target)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            cs.newLineAtOffset(50, 750);
            cs.showText(text);
            cs.endText();
        }
    }

    private List<PDFText> find(String term, boolean regex, boolean wholeWord) throws IOException {
        TextFinder finder = new TextFinder(term, regex, wholeWord);
        finder.getText(document);
        return finder.getFoundTexts();
    }

    @Nested
    @DisplayName("Literal vs regex metacharacter handling")
    class LiteralVsRegex {

        @Test
        @DisplayName("literal search treats regex metacharacters as plain text")
        void literalMetacharacters() throws IOException {
            // "a.c" literally; with \Q..\E it must NOT match "abc".
            addText("Match a.c here but not abc here");
            List<PDFText> found = find("a.c", false, false);
            assertThat(found).hasSize(1);
            assertThat(found.get(0).getText()).isEqualTo("a.c");
        }

        @Test
        @DisplayName("regex search interprets the dot as a wildcard")
        void regexWildcard() throws IOException {
            // As a regex, "a.c" (dot = any char) matches "atc" (from "Match"), "a.c" and "abc".
            addText("Match a.c here and abc here");
            List<PDFText> found = find("a.c", true, false);
            assertThat(found).extracting(PDFText::getText).containsExactly("atc", "a.c", "abc");
        }
    }

    @Nested
    @DisplayName("Search term trimming")
    class Trimming {

        @Test
        @DisplayName("leading and trailing whitespace is trimmed before matching")
        void trimsSurroundingWhitespace() throws IOException {
            addText("the keyword appears once");
            // Term has padding; the trimmed "keyword" should match.
            List<PDFText> found = find("   keyword   ", false, false);
            assertThat(found).hasSize(1);
            assertThat(found.get(0).getText()).isEqualTo("keyword");
        }
    }

    @Nested
    @DisplayName("Whole-word single-character (non-digit)")
    class SingleCharNonDigit {

        @Test
        @DisplayName("single non-digit letter matches only as a standalone token")
        void standaloneLetterOnly() throws IOException {
            // Only the lone "x" should match, not the x inside "box" or "xen".
            addText("a x box xen end");
            List<PDFText> found = find("x", false, true);
            assertThat(found).hasSize(1);
            assertThat(found.get(0).getText()).isEqualTo("x");
        }
    }

    @Nested
    @DisplayName("Multi-page matching and accumulation")
    class MultiPage {

        @Test
        @DisplayName("no matches on any page yields an empty result list")
        void noMatchAcrossPages() throws IOException {
            PDPage second = new PDPage(PDRectangle.A4);
            document.addPage(second);
            addText("first page text");
            addText(second, "second page text");

            List<PDFText> found = find("absent", false, false);
            assertThat(found).isEmpty();
        }

        @Test
        @DisplayName("page index is zero-based for the matched page")
        void pageIndexZeroBased() throws IOException {
            PDPage second = new PDPage(PDRectangle.A4);
            document.addPage(second);
            addText("alpha only here");
            addText(second, "beta only here");

            List<PDFText> found = find("beta", false, false);
            assertThat(found).hasSize(1);
            assertThat(found.get(0).getPageIndex()).isEqualTo(1);
        }

        @Test
        @DisplayName("repeated runs accumulate into the same foundTexts list")
        void accumulatesAcrossRuns() throws IOException {
            addText("repeat repeat repeat");
            TextFinder finder = new TextFinder("repeat", false, false);
            finder.getText(document);
            finder.getText(document);
            // Each pass over the single page finds 3, so two passes give 6.
            assertThat(finder.getFoundTexts()).hasSize(6);
        }
    }

    @Nested
    @DisplayName("getDebugInfo")
    class DebugInfo {

        @Test
        @DisplayName("debug info reports extracted length and position count after extraction")
        void reportsCounts() throws IOException {
            addText("debuggable content");
            TextFinder finder = new TextFinder("content", false, false);
            finder.getText(document);

            String debug = finder.getDebugInfo();
            assertThat(debug)
                    .contains("Extracted text length")
                    .contains("Position count")
                    .contains("Text content");
        }
    }

    @Nested
    @DisplayName("Case sensitivity")
    class CaseSensitivity {

        @Test
        @DisplayName("matching is case-insensitive for literal terms")
        void caseInsensitiveLiteral() throws IOException {
            addText("Mixed Case WORD word WoRd");
            List<PDFText> found = find("word", false, false);
            assertThat(found).hasSize(3);
        }
    }
}
