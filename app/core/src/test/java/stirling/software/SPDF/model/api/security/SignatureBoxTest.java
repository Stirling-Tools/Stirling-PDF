package stirling.software.SPDF.model.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Tests for {@link SignatureBox}. The y-axis flip is the kind of arithmetic that looks right and is
 * wrong by exactly one page height, so each case pins the resulting PDF rectangle rather than just
 * asserting it is "somewhere sensible".
 */
class SignatureBoxTest {

    /** A4 in points, the page size these numbers are easiest to reason about on. */
    private static final PDRectangle A4 = PDRectangle.A4; // 595.28 x 841.89

    @Nested
    @DisplayName("Building from request values")
    class Construction {

        @Test
        @DisplayName("No position at all yields null, so the legacy placement is kept")
        void allNullMeansUnspecified() {
            assertNull(SignatureBox.from(null, null, null, null));
        }

        @Test
        @DisplayName("A position without a size falls back to the default box size")
        void defaultsSize() {
            SignatureBox box = SignatureBox.from(100f, 200f, null, null);

            assertNotNull(box);
            assertEquals(100f, box.x());
            assertEquals(200f, box.y());
            assertEquals(SignatureBox.DEFAULT_WIDTH, box.width());
            assertEquals(SignatureBox.DEFAULT_HEIGHT, box.height());
        }

        @Test
        @DisplayName("Zero or negative sizes fall back to the defaults instead of vanishing")
        void rejectsNonPositiveSize() {
            SignatureBox box = SignatureBox.from(10f, 10f, 0f, -50f);

            // A zero-width box would sign the document with an invisible signature.
            assertEquals(SignatureBox.DEFAULT_WIDTH, box.width());
            assertEquals(SignatureBox.DEFAULT_HEIGHT, box.height());
        }

        @Test
        @DisplayName("A size without a position anchors at the top-left corner")
        void sizeWithoutPosition() {
            SignatureBox box = SignatureBox.from(null, null, 300f, 80f);

            assertEquals(0f, box.x());
            assertEquals(0f, box.y());
            assertEquals(300f, box.width());
        }
    }

    @Nested
    @DisplayName("Converting to PDF coordinates")
    class Conversion {

        @Test
        @DisplayName("y is measured from the top, so the flip lands the box below the top edge")
        void flipsYAxis() {
            // 50pt down from the top, 40pt tall: its bottom edge sits 90pt below the top.
            SignatureBox box = new SignatureBox(30f, 50f, 200f, 40f);

            PDRectangle rect = box.toPdfRectangle(A4);

            assertEquals(30f, rect.getLowerLeftX(), 0.01f);
            assertEquals(A4.getHeight() - 90f, rect.getLowerLeftY(), 0.01f);
            assertEquals(200f, rect.getWidth(), 0.01f);
            assertEquals(40f, rect.getHeight(), 0.01f);
        }

        @Test
        @DisplayName("A box at the top-left corner touches the top of the page")
        void topLeftCorner() {
            PDRectangle rect = new SignatureBox(0f, 0f, 100f, 50f).toPdfRectangle(A4);

            assertEquals(0f, rect.getLowerLeftX(), 0.01f);
            // Its upper edge is the page's upper edge.
            assertEquals(A4.getHeight(), rect.getUpperRightY(), 0.01f);
        }

        @Test
        @DisplayName("A box dragged past the right edge is pulled back inside")
        void clampsHorizontally() {
            // 500pt from the left on a 595pt-wide page, with a 200pt box: 105pt would overflow.
            PDRectangle rect = new SignatureBox(500f, 100f, 200f, 50f).toPdfRectangle(A4);

            assertEquals(A4.getWidth() - 200f, rect.getLowerLeftX(), 0.01f);
            assertTrue(
                    rect.getUpperRightX() <= A4.getWidth() + 0.01f,
                    "box must not extend past the right edge");
        }

        @Test
        @DisplayName("A box dragged past the bottom edge is pulled back inside")
        void clampsVertically() {
            PDRectangle rect = new SignatureBox(50f, 830f, 200f, 50f).toPdfRectangle(A4);

            assertTrue(rect.getLowerLeftY() >= -0.01f, "box must not extend below the page");
            assertEquals(0f, rect.getLowerLeftY(), 0.01f);
        }

        @Test
        @DisplayName("Negative coordinates are pulled back to the page edge")
        void clampsNegative() {
            PDRectangle rect = new SignatureBox(-100f, -100f, 200f, 50f).toPdfRectangle(A4);

            assertEquals(0f, rect.getLowerLeftX(), 0.01f);
            assertEquals(A4.getHeight(), rect.getUpperRightY(), 0.01f);
        }

        @Test
        @DisplayName("A box bigger than the page shrinks to the page instead of overflowing")
        void shrinksOversizedBox() {
            PDRectangle rect = new SignatureBox(0f, 0f, 9999f, 9999f).toPdfRectangle(A4);

            assertEquals(A4.getWidth(), rect.getWidth(), 0.01f);
            assertEquals(A4.getHeight(), rect.getHeight(), 0.01f);
        }

        @Test
        @DisplayName("A page whose media box does not start at the origin is honoured")
        void respectsOffsetMediaBox() {
            // Cropped or imposed pages can have a non-zero lower-left corner.
            PDRectangle offset = new PDRectangle(20f, 30f, 400f, 600f);

            PDRectangle rect = new SignatureBox(10f, 10f, 100f, 50f).toPdfRectangle(offset);

            assertEquals(30f, rect.getLowerLeftX(), 0.01f);
            // 10pt down from the top of a 600pt-tall box that starts at y=30.
            assertEquals(30f + 600f - 10f - 50f, rect.getLowerLeftY(), 0.01f);
        }
    }
}
