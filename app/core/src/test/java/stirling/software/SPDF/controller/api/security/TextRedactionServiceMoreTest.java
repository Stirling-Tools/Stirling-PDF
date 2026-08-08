package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.List;
import java.util.Map;

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

@DisplayName("TextRedactionService additional coverage")
class TextRedactionServiceMoreTest {

    private static final float FONT_SIZE = 12f;
    private static final float LEFT_X = 72f;
    private static final float TOP_Y = PDRectangle.LETTER.getHeight() - 80f;

    private final TextRedactionService service = new TextRedactionService();

    private PDFont helvetica() {
        return new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    }

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

    @Nested
    @DisplayName("TextSegment / MatchRange data classes")
    class DataClasses {

        @Test
        @DisplayName("TextSegment exposes its constructor values via accessors")
        void textSegmentAccessors() {
            PDFont font = helvetica();
            TextRedactionService.TextSegment segment =
                    new TextRedactionService.TextSegment(3, "Tj", "hello", 10, 15, font, 12f);

            assertThat(segment.getTokenIndex()).isEqualTo(3);
            assertThat(segment.getOperatorName()).isEqualTo("Tj");
            assertThat(segment.getText()).isEqualTo("hello");
            assertThat(segment.getStartPos()).isEqualTo(10);
            assertThat(segment.getEndPos()).isEqualTo(15);
            assertThat(segment.getFont()).isSameAs(font);
            assertThat(segment.getFontSize()).isEqualTo(12f);
        }

        @Test
        @DisplayName("MatchRange exposes start and end positions")
        void matchRangeAccessors() {
            TextRedactionService.MatchRange range = new TextRedactionService.MatchRange(4, 9);
            assertThat(range.getStartPos()).isEqualTo(4);
            assertThat(range.getEndPos()).isEqualTo(9);
        }
    }
}
