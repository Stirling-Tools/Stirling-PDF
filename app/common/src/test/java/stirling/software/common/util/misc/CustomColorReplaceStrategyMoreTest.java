package stirling.software.common.util.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.InputStreamResource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.api.misc.HighContrastColorCombination;
import stirling.software.common.model.api.misc.ReplaceAndInvert;

/**
 * Gap-filling tests for {@link CustomColorReplaceStrategy#replace()} that run the full restyle loop
 * against real, tiny PDFs built in-memory with PDFBox. No external process is launched.
 */
class CustomColorReplaceStrategyMoreTest {

    /**
     * A one-page PDF that draws a line of text so the restyle loop has TextPositions to process.
     */
    private static byte[] pdfWithText(String text) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(72, 700);
                cs.showText(text);
                cs.endText();
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static byte[] emptyPagePdf() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static MultipartFile pdf(byte[] bytes) {
        return new MockMultipartFile("file", "input.pdf", "application/pdf", bytes);
    }

    private static int pageCount(InputStreamResource resource) throws IOException {
        try (InputStream is = resource.getInputStream();
                PDDocument doc = Loader.loadPDF(is.readAllBytes())) {
            return doc.getNumberOfPages();
        }
    }

    @Nested
    @DisplayName("replace - custom colours")
    class CustomColourTests {

        @Test
        @DisplayName("restyles text and overlays a background, returning a valid PDF")
        void customColoursProduceValidPdf() throws Exception {
            CustomColorReplaceStrategy strategy =
                    new CustomColorReplaceStrategy(
                            pdf(pdfWithText("Hello World")),
                            ReplaceAndInvert.CUSTOM_COLOR,
                            "#000000",
                            "#FFFFFF",
                            null);

            InputStreamResource result = strategy.replace();
            assertThat(result).isNotNull();
            assertThat(pageCount(result)).isEqualTo(1);
        }

        @Test
        @DisplayName("a page without any text still gets the background overlay")
        void emptyPageStillProcessed() throws Exception {
            CustomColorReplaceStrategy strategy =
                    new CustomColorReplaceStrategy(
                            pdf(emptyPagePdf()),
                            ReplaceAndInvert.CUSTOM_COLOR,
                            "#112233",
                            "#AABBCC",
                            null);

            InputStreamResource result = strategy.replace();
            assertThat(pageCount(result)).isEqualTo(1);
        }

        @Test
        @DisplayName("text restyling runs through the font-encoding path without failing")
        void fontEncodingPathExercised() throws Exception {
            CustomColorReplaceStrategy strategy =
                    new CustomColorReplaceStrategy(
                            pdf(pdfWithText("Hi there 123")),
                            ReplaceAndInvert.CUSTOM_COLOR,
                            "#101010",
                            "#FFFFFF",
                            null);

            InputStreamResource result = strategy.replace();
            assertThat(pageCount(result)).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("replace - high contrast colours")
    class HighContrastTests {

        @Test
        @DisplayName("high-contrast mode resolves colours from the combination and produces a PDF")
        void highContrastProducesValidPdf() throws Exception {
            CustomColorReplaceStrategy strategy =
                    new CustomColorReplaceStrategy(
                            pdf(pdfWithText("Contrast")),
                            ReplaceAndInvert.HIGH_CONTRAST_COLOR,
                            null,
                            null,
                            HighContrastColorCombination.WHITE_TEXT_ON_BLACK);

            InputStreamResource result = strategy.replace();
            assertThat(pageCount(result)).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("replace - invalid input")
    class InvalidInputTests {

        @Test
        @DisplayName("a non-PDF payload causes replace() to throw")
        void nonPdfThrows() {
            CustomColorReplaceStrategy strategy =
                    new CustomColorReplaceStrategy(
                            pdf("not a pdf".getBytes()),
                            ReplaceAndInvert.CUSTOM_COLOR,
                            "000000",
                            "FFFFFF",
                            null);

            assertThatThrownBy(strategy::replace).isInstanceOf(IOException.class);
        }
    }
}
