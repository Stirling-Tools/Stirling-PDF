package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.PDFText;

class MultiPatternTextFinderTest {

    private PDDocument singlePageDoc(String text) throws IOException {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage();
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            cs.newLineAtOffset(50, 700);
            cs.showText(text);
            cs.endText();
        }
        return doc;
    }

    private Map<Integer, List<PDFText>> scan(PDDocument doc, List<Pattern> patterns)
            throws IOException {
        MultiPatternTextFinder finder = new MultiPatternTextFinder(patterns);
        finder.setStartPage(1);
        finder.setEndPage(doc.getNumberOfPages());
        finder.getText(doc);
        return finder.getFoundTextsByPage();
    }

    @Nested
    @DisplayName("matching")
    class Matching {

        @Test
        @DisplayName("finds a single literal match with bounding box")
        void singleMatch() throws IOException {
            try (PDDocument doc = singlePageDoc("Hello World")) {
                Map<Integer, List<PDFText>> result = scan(doc, List.of(Pattern.compile("World")));

                assertThat(result).containsKey(0);
                List<PDFText> hits = result.get(0);
                assertThat(hits).hasSize(1);
                PDFText hit = hits.get(0);
                assertThat(hit.getText()).isEqualTo("World");
                assertThat(hit.getPageIndex()).isZero();
                assertThat(hit.getX2()).isGreaterThan(hit.getX1());
                assertThat(hit.getY2()).isGreaterThanOrEqualTo(hit.getY1());
            }
        }

        @Test
        @DisplayName("multiple patterns matched in one pass")
        void multiplePatterns() throws IOException {
            try (PDDocument doc = singlePageDoc("alpha beta gamma")) {
                Map<Integer, List<PDFText>> result =
                        scan(doc, List.of(Pattern.compile("alpha"), Pattern.compile("gamma")));

                assertThat(result.get(0)).hasSize(2);
            }
        }

        @Test
        @DisplayName("same pattern matched multiple times")
        void repeatedMatch() throws IOException {
            try (PDDocument doc = singlePageDoc("ab ab ab")) {
                Map<Integer, List<PDFText>> result = scan(doc, List.of(Pattern.compile("ab")));

                assertThat(result.get(0)).hasSize(3);
            }
        }

        @Test
        @DisplayName("no match yields empty result map")
        void noMatch() throws IOException {
            try (PDDocument doc = singlePageDoc("nothing here")) {
                Map<Integer, List<PDFText>> result = scan(doc, List.of(Pattern.compile("absent")));

                assertThat(result).isEmpty();
            }
        }

        @Test
        @DisplayName("regex pattern with groups matches")
        void regexMatch() throws IOException {
            try (PDDocument doc = singlePageDoc("id 12345 done")) {
                Map<Integer, List<PDFText>> result = scan(doc, List.of(Pattern.compile("\\d+")));

                assertThat(result.get(0)).hasSize(1);
                assertThat(result.get(0).get(0).getText()).isEqualTo("12345");
            }
        }
    }
}
