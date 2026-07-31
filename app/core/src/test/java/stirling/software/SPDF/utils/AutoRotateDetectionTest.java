package stirling.software.SPDF.utils;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.List;
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
            TextDirection direction = AutoRotateDetection.detectTextDirections(document).get(0);

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
            TextDirection direction = AutoRotateDetection.detectTextDirections(document).get(0);
            assertThat(direction.isConclusive()).isFalse();
        }
    }

    @Test
    void emptyPageIsNotConclusive() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage(PDRectangle.LETTER));
            TextDirection direction = AutoRotateDetection.detectTextDirections(document).get(0);
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
            TextDirection direction = AutoRotateDetection.detectTextDirections(document).get(0);
            assertThat(direction.isConclusive()).isFalse();
        }
    }

    @Test
    void unanimousShortTextIsConclusive() throws IOException {
        // Between MIN_GLYPHS_UNANIMOUS (8) and MIN_GLYPHS (30): trusted only because every
        // glyph agrees on direction, the sparse-page path (e.g. a lone header or URL line).
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        document.addPage(page);
        try (PDPageContentStream content = new PDPageContentStream(document, page)) {
            content.beginText();
            content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            content.setTextMatrix(Matrix.getRotateInstance(Math.toRadians(90), 300, 200));
            content.showText("york.gov.uk/pay");
            content.endText();
        }
        try (document) {
            TextDirection direction = AutoRotateDetection.detectTextDirections(document).get(0);
            assertThat(direction.glyphCount())
                    .isBetween(
                            AutoRotateDetection.MIN_GLYPHS_UNANIMOUS,
                            AutoRotateDetection.MIN_GLYPHS - 1);
            assertThat(direction.dominance()).isEqualTo(1.0);
            assertThat(direction.isConclusive()).isTrue();
            assertThat(direction.dominantDirection()).isEqualTo(90);
        }
    }

    @Test
    void bucketsGlyphsPerPageInOneWalk() throws IOException {
        // Each page carries text at a different angle; the single-pass walk must attribute
        // glyphs to the right page rather than pooling them.
        int[] angles = {0, 90, 180, 270};
        try (PDDocument document = new PDDocument()) {
            for (int angle : angles) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                document.addPage(page);
                try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                    content.beginText();
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    content.setTextMatrix(
                            Matrix.getRotateInstance(Math.toRadians(angle), 300, 400));
                    content.showText(SAMPLE_TEXT);
                    content.endText();
                }
            }

            List<TextDirection> directions = AutoRotateDetection.detectTextDirections(document);

            assertThat(directions).hasSize(angles.length);
            for (int i = 0; i < angles.length; i++) {
                assertThat(directions.get(i).isConclusive()).as("page %d", i + 1).isTrue();
                assertThat(directions.get(i).dominantDirection())
                        .as("page %d direction", i + 1)
                        .isEqualTo(angles[i]);
            }
        }
    }

    @Test
    void detectsBlankAndInkedRenders() {
        BufferedImage blank = new BufferedImage(200, 200, BufferedImage.TYPE_BYTE_GRAY);
        Graphics2D g = blank.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 200, 200);
        g.dispose();
        assertThat(AutoRotateDetection.isBlankRender(blank)).isTrue();

        BufferedImage speck = copyOf(blank);
        Graphics2D specked = speck.createGraphics();
        specked.setColor(Color.BLACK);
        specked.fillRect(0, 0, 2, 2); // a dust speck must not count as content
        specked.dispose();
        assertThat(AutoRotateDetection.isBlankRender(speck)).isTrue();

        BufferedImage inked = copyOf(blank);
        Graphics2D inkedG = inked.createGraphics();
        inkedG.setColor(Color.BLACK);
        inkedG.fillRect(20, 20, 120, 60);
        inkedG.dispose();
        assertThat(AutoRotateDetection.isBlankRender(inked)).isFalse();
    }

    private static BufferedImage copyOf(BufferedImage source) {
        BufferedImage copy =
                new BufferedImage(source.getWidth(), source.getHeight(), source.getType());
        Graphics2D g = copy.createGraphics();
        g.drawImage(source, 0, 0, null);
        g.dispose();
        return copy;
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
