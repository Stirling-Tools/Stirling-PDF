package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class AllTextLineExtractorTest {

    private PDDocument doc;
    private PDPage page;

    private void newDoc() {
        doc = new PDDocument();
        page = new PDPage(PDRectangle.LETTER);
        doc.addPage(page);
    }

    private void writeAt(float x, float y, String text) throws IOException {
        try (PDPageContentStream cs =
                new PDPageContentStream(
                        doc, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 11);
            cs.newLineAtOffset(x, y);
            cs.showText(text);
            cs.endText();
        }
    }

    private AllTextLineExtractor extract() throws IOException {
        float pageHeight = page.getMediaBox().getHeight();
        AllTextLineExtractor extractor = new AllTextLineExtractor(1, pageHeight);
        extractor.getText(doc);
        return extractor;
    }

    @Nested
    @DisplayName("line grouping")
    class LineGrouping {

        @Test
        @DisplayName("single line of text yields one box")
        void singleLine() throws IOException {
            newDoc();
            writeAt(72, 700, "one line of text");
            try (PDDocument d = doc) {
                AllTextLineExtractor extractor = extract();
                assertThat(extractor.getLineBoxes()).hasSize(1);
                assertThat(extractor.getScreenLineBoxes()).hasSize(1);
            }
        }

        @Test
        @DisplayName("two vertically separated lines yield two boxes")
        void twoLines() throws IOException {
            newDoc();
            writeAt(72, 700, "first line");
            writeAt(72, 650, "second line");
            try (PDDocument d = doc) {
                AllTextLineExtractor extractor = extract();
                assertThat(extractor.getLineBoxes()).hasSize(2);
            }
        }

        @Test
        @DisplayName("large horizontal gap on same baseline splits into two boxes")
        void columnGapSplit() throws IOException {
            newDoc();
            writeAt(72, 700, "leftcol");
            writeAt(400, 700, "rightcol");
            try (PDDocument d = doc) {
                AllTextLineExtractor extractor = extract();
                assertThat(extractor.getLineBoxes().size()).isGreaterThanOrEqualTo(2);
            }
        }
    }

    @Nested
    @DisplayName("coordinate conversion")
    class Coordinates {

        @Test
        @DisplayName("pdf box Y is page-height minus screen Y")
        void pdfCoordsDerivedFromScreen() throws IOException {
            newDoc();
            writeAt(72, 700, "coords");
            try (PDDocument d = doc) {
                AllTextLineExtractor extractor = extract();
                float[] pdfBox = extractor.getLineBoxes().get(0);
                float[] screenBox = extractor.getScreenLineBoxes().get(0);
                float pageHeight = page.getMediaBox().getHeight();
                // pdfY1 = pageHeight - maxScreenY (screenBox[3])
                assertThat(pdfBox[1]).isCloseTo(pageHeight - screenBox[3], within());
                assertThat(pdfBox[3]).isCloseTo(pageHeight - screenBox[1], within());
                // x coords identical
                assertThat(pdfBox[0]).isEqualTo(screenBox[0]);
                assertThat(pdfBox[2]).isEqualTo(screenBox[2]);
            }
        }

        private org.assertj.core.data.Offset<Float> within() {
            return org.assertj.core.data.Offset.offset(0.01f);
        }
    }

    @Nested
    @DisplayName("whitespace handling")
    class Whitespace {

        @Test
        @DisplayName("blank page produces no line boxes")
        void blankPage() throws IOException {
            newDoc();
            try (PDDocument d = doc) {
                AllTextLineExtractor extractor = extract();
                assertThat(extractor.getLineBoxes()).isEmpty();
                assertThat(extractor.getScreenLineBoxes()).isEmpty();
            }
        }
    }
}
