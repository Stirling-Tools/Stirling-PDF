package stirling.software.SPDF.utils;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.Optional;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.util.Matrix;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import stirling.software.SPDF.utils.AutoRotateDetection.OsdResult;
import stirling.software.SPDF.utils.AutoRotateDetection.TextDirection;

class AutoRotateDetectionTest {

    private static final String SAMPLE_TEXT =
            "The quick brown fox jumps over the lazy dog again and again";

    private PDDocument docWithText(int textAngleDegrees, int pageRotation) throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        document.addPage(page);
        try (PDPageContentStream content = new PDPageContentStream(document, page)) {
            content.beginText();
            content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            content.setTextMatrix(
                    Matrix.getRotateInstance(Math.toRadians(textAngleDegrees), 300, 400));
            content.showText(SAMPLE_TEXT);
            content.endText();
        }
        page.setRotation(pageRotation);
        return document;
    }

    /**
     * Ground truth per the PDF spec: /Rotate R displays the page R degrees clockwise, so upright
     * page-space text under /Rotate R needs a further (360 - R) % 360 to display upright again;
     * text drawn rotated T degrees CCW in page space needs T clockwise to correct. Combined, the
     * expected correction is (T - R) mod 360.
     */
    @ParameterizedTest
    @CsvSource({
        // textAngle, pageRotation, expectedCorrection
        "0,   0,   0",
        "0,   90,  270",
        "0,   180, 180",
        "0,   270, 90",
        "90,  0,   90",
        "180, 0,   180",
        "270, 0,   270",
        "90,  90,  0",
        "180, 90,  90",
    })
    void detectsCorrectionForRotatedTextAndPages(
            int textAngle, int pageRotation, int expectedCorrection) throws IOException {
        try (PDDocument document = docWithText(textAngle, pageRotation)) {
            TextDirection direction = AutoRotateDetection.detectTextDirection(document, 0);

            assertThat(direction.isConclusive())
                    .as(
                            "direction should be conclusive, glyphs=%d dominance=%s",
                            direction.glyphCount(), direction.dominance())
                    .isTrue();
            assertThat(
                            AutoRotateDetection.correctionFromTextDirection(
                                    direction.dominantDirection(),
                                    Math.floorMod(pageRotation, 360)))
                    .isEqualTo(expectedCorrection);
        }
    }

    @Test
    void mixedDirectionsAreNotConclusive() throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        document.addPage(page);
        try (PDPageContentStream content = new PDPageContentStream(document, page)) {
            content.beginText();
            content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            content.setTextMatrix(Matrix.getTranslateInstance(100, 400));
            content.showText(SAMPLE_TEXT);
            content.setTextMatrix(Matrix.getRotateInstance(Math.toRadians(90), 300, 200));
            content.showText(SAMPLE_TEXT);
            content.endText();
        }
        try (document) {
            TextDirection direction = AutoRotateDetection.detectTextDirection(document, 0);
            assertThat(direction.isConclusive()).isFalse();
        }
    }

    @Test
    void emptyPageIsNotConclusive() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage(PDRectangle.LETTER));
            TextDirection direction = AutoRotateDetection.detectTextDirection(document, 0);
            assertThat(direction.glyphCount()).isZero();
            assertThat(direction.isConclusive()).isFalse();
        }
    }

    @Test
    void shortTextIsNotConclusive() throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        document.addPage(page);
        try (PDPageContentStream content = new PDPageContentStream(document, page)) {
            content.beginText();
            content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            content.setTextMatrix(Matrix.getTranslateInstance(100, 400));
            content.showText("Short");
            content.endText();
        }
        try (document) {
            TextDirection direction = AutoRotateDetection.detectTextDirection(document, 0);
            assertThat(direction.isConclusive()).isFalse();
        }
    }

    @Test
    void parsesTypicalOsdOutput() {
        String output =
                """
                Estimating resolution as 336
                Page number: 0
                Orientation in degrees: 180
                Rotate: 180
                Orientation confidence: 9.15
                Script: Latin
                Script confidence: 4.43
                """;
        Optional<OsdResult> result = AutoRotateDetection.parseOsd(output);
        assertThat(result).isPresent();
        assertThat(result.get().rotate()).isEqualTo(180);
        assertThat(result.get().confidence()).isEqualTo(9.15);
    }

    @Test
    void parseOsdRejectsIncompleteOutput() {
        assertThat(AutoRotateDetection.parseOsd("Too few characters. Skipping this page"))
                .isEmpty();
        assertThat(AutoRotateDetection.parseOsd("Rotate: 90")).isEmpty();
        assertThat(AutoRotateDetection.parseOsd(null)).isEmpty();
        assertThat(AutoRotateDetection.parseOsd("")).isEmpty();
    }
}
