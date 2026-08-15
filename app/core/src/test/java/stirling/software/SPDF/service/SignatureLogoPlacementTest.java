package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import stirling.software.SPDF.model.api.security.SignatureLogoPosition;

/**
 * Tests for {@link SignatureLogoPlacement}.
 *
 * <p>The interesting cases are the extreme images: a banner-shaped logo asked to sit in a narrow
 * column, and a tall one asked to sit in a short band. Those are where a naive split either
 * distorts the image or leaves the text nowhere to go, so they are checked in every position rather
 * than only in the one they were written for.
 */
class SignatureLogoPlacementTest {

    /** A signature box of the size the tool creates by default. */
    private static final PDRectangle BOX = new PDRectangle(100f, 200f, 200f, 60f);

    private static final float SQUARE = 1f;
    private static final float VERY_WIDE = 8f;
    private static final float VERY_TALL = 0.125f;

    private static final float TOLERANCE = 0.01f;

    @Nested
    @DisplayName("Whatever the position and the image")
    class Invariants {

        @ParameterizedTest
        @EnumSource(SignatureLogoPosition.class)
        @DisplayName("The logo stays inside the box")
        void logoStaysInsideTheBox(SignatureLogoPosition position) {
            for (float aspect : new float[] {SQUARE, VERY_WIDE, VERY_TALL}) {
                PDRectangle logo = SignatureLogoPlacement.place(BOX, aspect, position).logoRect();

                assertTrue(
                        logo.getLowerLeftX() >= BOX.getLowerLeftX() - TOLERANCE,
                        position + " with aspect " + aspect + " spills off the left edge");
                assertTrue(
                        logo.getLowerLeftY() >= BOX.getLowerLeftY() - TOLERANCE,
                        position + " with aspect " + aspect + " spills off the bottom edge");
                assertTrue(
                        logo.getUpperRightX() <= BOX.getUpperRightX() + TOLERANCE,
                        position + " with aspect " + aspect + " spills off the right edge");
                assertTrue(
                        logo.getUpperRightY() <= BOX.getUpperRightY() + TOLERANCE,
                        position + " with aspect " + aspect + " spills off the top edge");
            }
        }

        @ParameterizedTest
        @EnumSource(SignatureLogoPosition.class)
        @DisplayName("The logo keeps the image's proportions")
        void logoKeepsAspectRatio(SignatureLogoPosition position) {
            for (float aspect : new float[] {SQUARE, VERY_WIDE, VERY_TALL}) {
                PDRectangle logo = SignatureLogoPlacement.place(BOX, aspect, position).logoRect();

                // A distorted company logo reads as a rendering fault, so this is not cosmetic.
                assertEquals(
                        aspect,
                        logo.getWidth() / logo.getHeight(),
                        0.05f,
                        position + " distorted an image of aspect " + aspect);
            }
        }

        @ParameterizedTest
        @EnumSource(SignatureLogoPosition.class)
        @DisplayName("The text keeps a usable share of the box")
        void textKeepsRoom(SignatureLogoPosition position) {
            for (float aspect : new float[] {SQUARE, VERY_WIDE, VERY_TALL}) {
                PDRectangle text = SignatureLogoPlacement.place(BOX, aspect, position).textRect();

                // 65% of each side is the floor the class promises; without it a banner-shaped
                // logo would squeeze the signer's name out of its own signature.
                assertTrue(
                        text.getWidth() >= BOX.getWidth() * 0.65f - TOLERANCE,
                        position + " left only " + text.getWidth() + "pt of width for the text");
                assertTrue(
                        text.getHeight() >= BOX.getHeight() * 0.65f - TOLERANCE,
                        position + " left only " + text.getHeight() + "pt of height for the text");
                assertTrue(
                        text.getLowerLeftX() >= BOX.getLowerLeftX() - TOLERANCE
                                && text.getUpperRightX() <= BOX.getUpperRightX() + TOLERANCE,
                        position + " put the text area outside the box horizontally");
                assertTrue(
                        text.getLowerLeftY() >= BOX.getLowerLeftY() - TOLERANCE
                                && text.getUpperRightY() <= BOX.getUpperRightY() + TOLERANCE,
                        position + " put the text area outside the box vertically");
            }
        }
    }

    @Nested
    @DisplayName("Each position puts the logo where it says")
    class Positions {

        @Test
        @DisplayName("LEFT keeps the logo left of the text")
        void left() {
            SignatureLogoPlacement.Placement placement =
                    SignatureLogoPlacement.place(BOX, SQUARE, SignatureLogoPosition.LEFT);

            assertTrue(
                    placement.logoRect().getUpperRightX()
                            <= placement.textRect().getLowerLeftX() + TOLERANCE,
                    "the logo overlaps the text area");
            assertEquals(BOX.getUpperRightX(), placement.textRect().getUpperRightX(), TOLERANCE);
        }

        @Test
        @DisplayName("RIGHT keeps the logo right of the text")
        void right() {
            SignatureLogoPlacement.Placement placement =
                    SignatureLogoPlacement.place(BOX, SQUARE, SignatureLogoPosition.RIGHT);

            assertTrue(
                    placement.logoRect().getLowerLeftX()
                            >= placement.textRect().getUpperRightX() - TOLERANCE,
                    "the logo overlaps the text area");
            assertEquals(BOX.getLowerLeftX(), placement.textRect().getLowerLeftX(), TOLERANCE);
        }

        @Test
        @DisplayName("TOP keeps the logo above the text")
        void top() {
            SignatureLogoPlacement.Placement placement =
                    SignatureLogoPlacement.place(BOX, SQUARE, SignatureLogoPosition.TOP);

            assertTrue(
                    placement.logoRect().getLowerLeftY()
                            >= placement.textRect().getUpperRightY() - TOLERANCE,
                    "the logo overlaps the text area");
            assertEquals(BOX.getLowerLeftY(), placement.textRect().getLowerLeftY(), TOLERANCE);
        }

        @Test
        @DisplayName("BOTTOM keeps the logo below the text")
        void bottom() {
            SignatureLogoPlacement.Placement placement =
                    SignatureLogoPlacement.place(BOX, SQUARE, SignatureLogoPosition.BOTTOM);

            assertTrue(
                    placement.logoRect().getUpperRightY()
                            <= placement.textRect().getLowerLeftY() + TOLERANCE,
                    "the logo overlaps the text area");
            assertEquals(BOX.getUpperRightY(), placement.textRect().getUpperRightY(), TOLERANCE);
        }

        @Test
        @DisplayName("BEHIND leaves the text the whole box and centres the logo in it")
        void behind() {
            SignatureLogoPlacement.Placement placement =
                    SignatureLogoPlacement.place(BOX, SQUARE, SignatureLogoPosition.BEHIND);

            // The text is drawn on top, so it loses nothing to the logo here.
            assertEquals(BOX.getWidth(), placement.textRect().getWidth(), TOLERANCE);
            assertEquals(BOX.getHeight(), placement.textRect().getHeight(), TOLERANCE);

            PDRectangle logo = placement.logoRect();
            assertEquals(
                    BOX.getLowerLeftX() + BOX.getWidth() / 2f,
                    logo.getLowerLeftX() + logo.getWidth() / 2f,
                    TOLERANCE,
                    "the logo is not horizontally centred");
            assertEquals(
                    BOX.getLowerLeftY() + BOX.getHeight() / 2f,
                    logo.getLowerLeftY() + logo.getHeight() / 2f,
                    TOLERANCE,
                    "the logo is not vertically centred");
            // A square logo in a box wider than it is tall is limited by the height.
            assertEquals(BOX.getHeight(), logo.getHeight(), TOLERANCE);
        }
    }

    @Nested
    @DisplayName("Bad input still produces a drawable layout")
    class Defensive {

        @Test
        @DisplayName("A null position is treated as LEFT")
        void nullPositionDefaultsToLeft() {
            SignatureLogoPlacement.Placement fromNull =
                    SignatureLogoPlacement.place(BOX, SQUARE, null);
            SignatureLogoPlacement.Placement fromLeft =
                    SignatureLogoPlacement.place(BOX, SQUARE, SignatureLogoPosition.LEFT);

            assertEquals(fromLeft.logoRect().getLowerLeftX(), fromNull.logoRect().getLowerLeftX());
            assertEquals(fromLeft.textRect().getWidth(), fromNull.textRect().getWidth());
        }

        @Test
        @DisplayName(
                "An unusable aspect ratio falls back to a square rather than a zero-sized logo")
        void brokenAspectRatioFallsBackToSquare() {
            for (float broken : new float[] {0f, -3f, Float.NaN, Float.POSITIVE_INFINITY}) {
                PDRectangle logo =
                        SignatureLogoPlacement.place(BOX, broken, SignatureLogoPosition.BEHIND)
                                .logoRect();

                assertTrue(logo.getWidth() > 0f, "aspect " + broken + " produced no width");
                assertTrue(logo.getHeight() > 0f, "aspect " + broken + " produced no height");
                assertEquals(1f, logo.getWidth() / logo.getHeight(), 0.05f);
            }
        }
    }
}
