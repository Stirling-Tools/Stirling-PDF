package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.InputStream;
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
import stirling.software.common.util.ExceptionUtils.ToolFailedException;
import stirling.software.jpdfium.redact.RedactResult.PageResult;

@DisplayName("TextRedactionService extra coverage")
class TextRedactionServiceExtraTest {

    private static final float FONT_SIZE = 12f;
    private static final float LEFT_X = 72f;
    private static final float TOP_Y = PDRectangle.LETTER.getHeight() - 80f;

    private final TextRedactionService service = new TextRedactionService();

    private PDFont helvetica(PDDocument doc) throws IOException {
        try (InputStream is = getClass().getResourceAsStream("/static/fonts/DejaVuSans.ttf")) {
            if (is != null) {
                return PDType0Font.load(doc, is);
            }
        }
        return new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    }

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

    @Nested
    @DisplayName("findTextToRedact matching modes")
    class FindModes {

        @Test
        @DisplayName("literal search is case-insensitive and matches every casing of the term")
        void literalIsCaseInsensitive() throws IOException {
            try (PDDocument doc = buildDoc("Secret and secret and SECRET")) {
                Map<Integer, List<PDFText>> result =
                        service.findTextToRedact(doc, new String[] {"secret"}, false, false);
                assertThat(result.get(0)).hasSize(3);
            }
        }

        @Test
        @DisplayName("case-sensitive search leaves text in another case alone")
        void caseSensitiveRegex() throws IOException {
            try (PDDocument doc = buildDoc("ticket FS-01 and fs-02")) {
                Map<Integer, List<PDFText>> result =
                        service.findTextToRedact(
                                doc, new String[] {"[A-Z]{2}-\\d+"}, true, false, true);
                assertThat(result.get(0)).hasSize(1);
                assertThat(result.get(0).get(0).getText()).isEqualTo("FS-01");
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

    @Nested
    @DisplayName("requireVerified")
    class RequireVerified {

        @Test
        @DisplayName("passes when every page was verified, including pages with no matches")
        void passesWhenEveryPageVerified() {
            assertThatCode(
                            () ->
                                    TextRedactionService.requireVerified(
                                            List.of(
                                                    new PageResult(0, 1, 2),
                                                    new PageResult(1, 1, 0))))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("names every page the engine could not verify, numbered from 1")
        void namesEveryUnverifiedPage() {
            assertThatThrownBy(
                            () ->
                                    TextRedactionService.requireVerified(
                                            List.of(
                                                    new PageResult(0, 1, 1),
                                                    new PageResult(1, 1, -1),
                                                    new PageResult(2, 1, 0),
                                                    new PageResult(3, 1, -1))))
                    .isInstanceOf(ToolFailedException.class)
                    .hasMessageContaining("2, 4")
                    .satisfies(
                            e ->
                                    assertThat(((ToolFailedException) e).getErrorCode())
                                            .isEqualTo("E077"));
        }
    }
}
