package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.SPDF.model.api.security.SignatureBox;

/**
 * Tests that a mark lands where the user drew it whatever the page has been turned to, and comes
 * out level rather than on its side.
 *
 * <p>These render the page rather than reading its operators, because the question is what a reader
 * ends up looking at: a transform can be present and still be the wrong way round.
 */
class SignatureMarkRotationTest {

    private static final List<SignatureAppearanceLayout.Field> FIELDS =
            List.of(new SignatureAppearanceLayout.Field("Signed by", "Samuel Saez", false));

    /** Bottom-left of the visible page, where the maths is easiest to check by eye. */
    private static final SignatureBox BOX = new SignatureBox(20f, 20f, 200f, 60f);

    private static PDDocument document(int rotation, PDRectangle crop) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < 2; i++) {
            PDPage page = new PDPage(PDRectangle.A4);
            if (crop != null) {
                page.setCropBox(crop);
            }
            page.setRotation(rotation);
            doc.addPage(page);
        }
        return doc;
    }

    /** The ink's bounding box on the rendered page, in pixels, or null when nothing was drawn. */
    private static int[] inkBounds(PDDocument doc, int pageIndex) throws Exception {
        BufferedImage image = new PDFRenderer(doc).renderImage(pageIndex, 1f);
        int minX = Integer.MAX_VALUE;
        int minY = Integer.MAX_VALUE;
        int maxX = -1;
        int maxY = -1;
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                if ((image.getRGB(x, y) & 0xFFFFFF) < 0xC0C0C0) {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }
        return maxX < 0 ? null : new int[] {minX, minY, maxX, maxY};
    }

    @Nested
    @DisplayName("However the page is turned")
    class Rotated {

        @ParameterizedTest
        @ValueSource(ints = {0, 90, 180, 270})
        @DisplayName("The mark is drawn level, not on its side")
        void markIsLevel(int rotation) throws Exception {
            try (PDDocument doc = document(rotation, null)) {
                assertEquals(1, SignatureMarkStamper.stampOtherPages(doc, 0, BOX, FIELDS));

                int[] ink = inkBounds(doc, 1);
                assertTrue(ink != null, "nothing was drawn at rotation " + rotation);
                int width = ink[2] - ink[0];
                int height = ink[3] - ink[1];
                // The box is 200x60, so a level mark is wider than it is tall whichever way the
                // page is stored. On its side the two would swap.
                assertTrue(
                        width > height,
                        "at rotation "
                                + rotation
                                + " the mark rendered "
                                + width
                                + "x"
                                + height
                                + ", which is on its side");
            }
        }

        @ParameterizedTest
        @ValueSource(ints = {0, 90, 180, 270})
        @DisplayName("The mark lands at the bottom left of the page the reader sees")
        void markLandsWhereItWasDrawn(int rotation) throws Exception {
            try (PDDocument doc = document(rotation, null)) {
                SignatureMarkStamper.stampOtherPages(doc, 0, BOX, FIELDS);

                BufferedImage image = new PDFRenderer(doc).renderImage(1, 1f);
                int[] ink = inkBounds(doc, 1);
                assertTrue(ink != null);
                // Drawn 20pt in from the left and 20pt up from the bottom of the visible page.
                assertTrue(
                        ink[0] < image.getWidth() / 2,
                        "rotation " + rotation + " put the mark on the right");
                assertTrue(
                        ink[3] > image.getHeight() / 2,
                        "rotation " + rotation + " put the mark at the top");
            }
        }
    }

    @Nested
    @DisplayName("On a trimmed page")
    class Cropped {

        @ParameterizedTest
        @ValueSource(ints = {0, 90})
        @DisplayName("The mark is measured against what the reader sees, not the sheet it sits on")
        void followsTheCropBox(int rotation) throws Exception {
            // A crop box well inside the sheet: reading the request against the media box would
            // put the mark a long way from where it was asked for.
            PDRectangle crop = new PDRectangle(100f, 200f, 300f, 400f);
            try (PDDocument doc = document(rotation, crop)) {
                SignatureMarkStamper.stampOtherPages(doc, 0, BOX, FIELDS);

                BufferedImage image = new PDFRenderer(doc).renderImage(1, 1f);
                int[] ink = inkBounds(doc, 1);
                assertTrue(ink != null, "nothing was drawn");
                // Rendering shows the crop box alone, so the mark has to be inside the image and
                // near its bottom-left corner.
                assertTrue(ink[0] >= 0 && ink[2] < image.getWidth(), "the mark left the page");
                assertTrue(ink[1] >= 0 && ink[3] < image.getHeight(), "the mark left the page");
                assertTrue(
                        ink[0] < image.getWidth() / 2 && ink[3] > image.getHeight() / 2,
                        "the mark was not at the bottom left of the visible page");
            }
        }
    }
}
