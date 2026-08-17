package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName;
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
 *
 * <p>The second group is about size rather than position: the strip is whatever the text can spare,
 * so the same image in the same corner comes out bigger in a roomy box than in a cramped one.
 */
class SignatureLogoPlacementTest {

    /** A signature box of the size the tool creates by default. */
    private static final PDRectangle BOX = new PDRectangle(100f, 200f, 200f, 60f);

    /** Small enough that the text needs nearly all of it. */
    private static final PDRectangle CRAMPED = new PDRectangle(0f, 0f, 60f, 15f);

    /** Big enough that three fields leave plenty over. */
    private static final PDRectangle ROOMY = new PDRectangle(0f, 0f, 300f, 120f);

    private static final float SQUARE = 1f;
    private static final float VERY_WIDE = 8f;
    private static final float VERY_TALL = 0.125f;

    private static final float TOLERANCE = 0.01f;

    private static final PDFont FONT = new PDType1Font(FontName.TIMES_BOLD);

    private static final SignatureAppearanceLayout.TextFit ANY =
            SignatureAppearanceLayout.TextFit.ANY;

    private static Map<String, String> fields() {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("Signer", "Jane Doe");
        fields.put("Date", "2026-08-17 10:15");
        fields.put("Reason", "Approved");
        return fields;
    }

    private static SignatureAppearanceLayout.TextFit textFitIn(PDRectangle box) throws IOException {
        return SignatureAppearanceLayout.keepsTheTextIntact(
                fields(), FONT, box.getWidth(), box.getHeight());
    }

    @Nested
    @DisplayName("Whatever the position and the image")
    class Invariants {

        @ParameterizedTest
        @EnumSource(SignatureLogoPosition.class)
        @DisplayName("The logo stays inside the box")
        void logoStaysInsideTheBox(SignatureLogoPosition position) throws IOException {
            for (float aspect : new float[] {SQUARE, VERY_WIDE, VERY_TALL}) {
                PDRectangle logo =
                        SignatureLogoPlacement.place(BOX, aspect, position, ANY).logoRect();

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
        void logoKeepsAspectRatio(SignatureLogoPosition position) throws IOException {
            for (float aspect : new float[] {SQUARE, VERY_WIDE, VERY_TALL}) {
                PDRectangle logo =
                        SignatureLogoPlacement.place(BOX, aspect, position, ANY).logoRect();

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
        @DisplayName("The text keeps half the box even when nothing protects it")
        void textKeepsRoom(SignatureLogoPosition position) throws IOException {
            for (float aspect : new float[] {SQUARE, VERY_WIDE, VERY_TALL}) {
                PDRectangle text =
                        SignatureLogoPlacement.place(BOX, aspect, position, ANY).textRect();

                // TextFit.ANY lets the logo take the largest strip allowed, so this is the hard
                // ceiling rather than a typical outcome: even then, half the box is the text's.
                assertTrue(
                        text.getWidth() >= BOX.getWidth() * 0.5f - TOLERANCE,
                        position + " left only " + text.getWidth() + "pt of width for the text");
                assertTrue(
                        text.getHeight() >= BOX.getHeight() * 0.5f - TOLERANCE,
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
    @DisplayName("The strip is whatever the text can spare")
    class SizedByTheText {

        /**
         * The complaint this answers: with a fixed third of the box, a logo asked to sit in a band
         * above a short signature came out about a millimetre tall, which users read as the logo
         * not working at all.
         */
        @ParameterizedTest
        @EnumSource(
                value = SignatureLogoPosition.class,
                names = {"LEFT", "RIGHT", "TOP", "BOTTOM"})
        @DisplayName("A roomy box gives the logo more than a fixed third would")
        void roomyBoxGrowsTheLogo(SignatureLogoPosition position) throws IOException {
            PDRectangle logo =
                    SignatureLogoPlacement.place(ROOMY, SQUARE, position, textFitIn(ROOMY))
                            .logoRect();

            float fixedThird =
                    position == SignatureLogoPosition.LEFT
                                    || position == SignatureLogoPosition.RIGHT
                            ? ROOMY.getWidth() * 0.35f
                            : ROOMY.getHeight() * 0.35f;
            float taken =
                    position == SignatureLogoPosition.LEFT
                                    || position == SignatureLogoPosition.RIGHT
                            ? logo.getWidth()
                            : logo.getHeight();

            assertTrue(
                    taken > fixedThird,
                    position + " took only " + taken + "pt where a third would be " + fixedThird);
        }

        @ParameterizedTest
        @EnumSource(
                value = SignatureLogoPosition.class,
                names = {"LEFT", "RIGHT", "TOP", "BOTTOM"})
        @DisplayName("A cramped box still draws the logo, in the position that was asked for")
        void crampedBoxStillDrawsIt(SignatureLogoPosition position) throws IOException {
            SignatureLogoPlacement.Placement placement =
                    SignatureLogoPlacement.place(CRAMPED, SQUARE, position, textFitIn(CRAMPED));
            PDRectangle logo = placement.logoRect();

            // Small is a legible outcome; absent is a bug report. The user picked this corner.
            assertTrue(logo.getWidth() > 0f && logo.getHeight() > 0f, position + " drew nothing");

            switch (position) {
                case LEFT ->
                        assertTrue(
                                logo.getUpperRightX()
                                        <= placement.textRect().getLowerLeftX() + TOLERANCE);
                case RIGHT ->
                        assertTrue(
                                logo.getLowerLeftX()
                                        >= placement.textRect().getUpperRightX() - TOLERANCE);
                case TOP ->
                        assertTrue(
                                logo.getLowerLeftY()
                                        >= placement.textRect().getUpperRightY() - TOLERANCE);
                case BOTTOM ->
                        assertTrue(
                                logo.getUpperRightY()
                                        <= placement.textRect().getLowerLeftY() + TOLERANCE);
                case BEHIND -> throw new IllegalStateException("not part of this test");
            }
        }

        /**
         * The floor, checked against the formula it replaced rather than against a number, so that
         * lowering the minimum share later fails here instead of quietly shrinking logos.
         *
         * <p>It bites where the text is hungriest: a band above a short signature has three fields
         * demanding the height, so sizing purely by what the text can spare would leave the logo
         * thinner than the old fixed share did.
         */
        @ParameterizedTest
        @EnumSource(
                value = SignatureLogoPosition.class,
                names = {"LEFT", "RIGHT", "TOP", "BOTTOM"})
        @DisplayName("No box and position comes out smaller than the fixed third used to give")
        void neverSmallerThanBefore(SignatureLogoPosition position) throws IOException {
            boolean beside =
                    position == SignatureLogoPosition.LEFT
                            || position == SignatureLogoPosition.RIGHT;

            for (PDRectangle box : new PDRectangle[] {ROOMY, BOX, CRAMPED}) {
                for (float aspect : new float[] {VERY_WIDE, SQUARE, VERY_TALL}) {
                    float gap = Math.min(box.getWidth(), box.getHeight()) * 0.04f;
                    float before =
                            beside
                                    ? Math.min(
                                            box.getWidth() * 0.35f - gap, box.getHeight() * aspect)
                                    : Math.min(
                                            box.getHeight() * 0.35f - gap, box.getWidth() / aspect);

                    PDRectangle logo =
                            SignatureLogoPlacement.place(box, aspect, position, textFitIn(box))
                                    .logoRect();
                    float now = beside ? logo.getWidth() : logo.getHeight();

                    assertTrue(
                            now >= before - TOLERANCE,
                            position
                                    + " in a "
                                    + (int) box.getWidth()
                                    + "x"
                                    + (int) box.getHeight()
                                    + " box with aspect "
                                    + aspect
                                    + " shrank from "
                                    + before
                                    + "pt to "
                                    + now
                                    + "pt");
                }
            }
        }

        @ParameterizedTest
        @EnumSource(
                value = SignatureLogoPosition.class,
                names = {"LEFT", "RIGHT", "TOP", "BOTTOM"})
        @DisplayName("Growing past the floor never costs the signature a line of text")
        void growingNeverCostsALine(SignatureLogoPosition position) throws IOException {
            boolean beside =
                    position == SignatureLogoPosition.LEFT
                            || position == SignatureLogoPosition.RIGHT;

            for (PDRectangle box : new PDRectangle[] {ROOMY, BOX, CRAMPED}) {
                PDRectangle atTheFloor =
                        SignatureLogoPlacement.place(
                                        box,
                                        VERY_WIDE,
                                        position,
                                        (width, height) -> false) // nothing fits -> the floor
                                .logoRect();
                SignatureLogoPlacement.Placement chosen =
                        SignatureLogoPlacement.place(box, VERY_WIDE, position, textFitIn(box));

                float floorSize = beside ? atTheFloor.getWidth() : atTheFloor.getHeight();
                float chosenSize =
                        beside ? chosen.logoRect().getWidth() : chosen.logoRect().getHeight();
                if (chosenSize <= floorSize + TOLERANCE) {
                    // At the floor the text gives way, as it always has; nothing to check.
                    continue;
                }

                int withTheWholeBox =
                        SignatureAppearanceLayout.fit(
                                        fields(), FONT, box.getWidth(), box.getHeight())
                                .lines()
                                .size();
                PDRectangle text = chosen.textRect();
                int withTheLogo =
                        SignatureAppearanceLayout.fit(
                                        fields(), FONT, text.getWidth(), text.getHeight())
                                .lines()
                                .size();

                assertTrue(
                        withTheLogo >= withTheWholeBox,
                        position
                                + " in a "
                                + (int) box.getWidth()
                                + "x"
                                + (int) box.getHeight()
                                + " box grew past the floor and dropped the text from "
                                + withTheWholeBox
                                + " lines to "
                                + withTheLogo);
            }
        }
    }

    @Nested
    @DisplayName("Each position puts the logo where it says")
    class Positions {

        @Test
        @DisplayName("LEFT keeps the logo left of the text")
        void left() throws IOException {
            SignatureLogoPlacement.Placement placement =
                    SignatureLogoPlacement.place(BOX, SQUARE, SignatureLogoPosition.LEFT, ANY);

            assertTrue(
                    placement.logoRect().getUpperRightX()
                            <= placement.textRect().getLowerLeftX() + TOLERANCE,
                    "the logo overlaps the text area");
            assertEquals(BOX.getUpperRightX(), placement.textRect().getUpperRightX(), TOLERANCE);
        }

        @Test
        @DisplayName("RIGHT keeps the logo right of the text")
        void right() throws IOException {
            SignatureLogoPlacement.Placement placement =
                    SignatureLogoPlacement.place(BOX, SQUARE, SignatureLogoPosition.RIGHT, ANY);

            assertTrue(
                    placement.logoRect().getLowerLeftX()
                            >= placement.textRect().getUpperRightX() - TOLERANCE,
                    "the logo overlaps the text area");
            assertEquals(BOX.getLowerLeftX(), placement.textRect().getLowerLeftX(), TOLERANCE);
        }

        @Test
        @DisplayName("TOP keeps the logo above the text")
        void top() throws IOException {
            SignatureLogoPlacement.Placement placement =
                    SignatureLogoPlacement.place(BOX, SQUARE, SignatureLogoPosition.TOP, ANY);

            assertTrue(
                    placement.logoRect().getLowerLeftY()
                            >= placement.textRect().getUpperRightY() - TOLERANCE,
                    "the logo overlaps the text area");
            assertEquals(BOX.getLowerLeftY(), placement.textRect().getLowerLeftY(), TOLERANCE);
        }

        @Test
        @DisplayName("BOTTOM keeps the logo below the text")
        void bottom() throws IOException {
            SignatureLogoPlacement.Placement placement =
                    SignatureLogoPlacement.place(BOX, SQUARE, SignatureLogoPosition.BOTTOM, ANY);

            assertTrue(
                    placement.logoRect().getUpperRightY()
                            <= placement.textRect().getLowerLeftY() + TOLERANCE,
                    "the logo overlaps the text area");
            assertEquals(BOX.getUpperRightY(), placement.textRect().getUpperRightY(), TOLERANCE);
        }

        @Test
        @DisplayName("BEHIND leaves the text the whole box and centres the logo in it")
        void behind() throws IOException {
            SignatureLogoPlacement.Placement placement =
                    SignatureLogoPlacement.place(BOX, SQUARE, SignatureLogoPosition.BEHIND, ANY);

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

        @Test
        @DisplayName("BEHIND scales to a cramped box instead of overflowing it")
        void behindInACrampedBox() throws IOException {
            PDRectangle logo =
                    SignatureLogoPlacement.place(
                                    CRAMPED, VERY_WIDE, SignatureLogoPosition.BEHIND, ANY)
                            .logoRect();

            assertTrue(logo.getWidth() <= CRAMPED.getWidth() + TOLERANCE);
            assertTrue(logo.getHeight() <= CRAMPED.getHeight() + TOLERANCE);
            assertEquals(VERY_WIDE, logo.getWidth() / logo.getHeight(), 0.05f);
            assertEquals(
                    CRAMPED.getLowerLeftX() + CRAMPED.getWidth() / 2f,
                    logo.getLowerLeftX() + logo.getWidth() / 2f,
                    TOLERANCE,
                    "the logo is not horizontally centred");
        }
    }

    @Nested
    @DisplayName("Bad input still produces a drawable layout")
    class Defensive {

        @Test
        @DisplayName("A null position is treated as LEFT")
        void nullPositionDefaultsToLeft() throws IOException {
            SignatureLogoPlacement.Placement fromNull =
                    SignatureLogoPlacement.place(BOX, SQUARE, null, ANY);
            SignatureLogoPlacement.Placement fromLeft =
                    SignatureLogoPlacement.place(BOX, SQUARE, SignatureLogoPosition.LEFT, ANY);

            assertEquals(fromLeft.logoRect().getLowerLeftX(), fromNull.logoRect().getLowerLeftX());
            assertEquals(fromLeft.textRect().getWidth(), fromNull.textRect().getWidth());
        }

        @Test
        @DisplayName(
                "An unusable aspect ratio falls back to a square rather than a zero-sized logo")
        void brokenAspectRatioFallsBackToSquare() throws IOException {
            for (float broken : new float[] {0f, -3f, Float.NaN, Float.POSITIVE_INFINITY}) {
                PDRectangle logo =
                        SignatureLogoPlacement.place(BOX, broken, SignatureLogoPosition.BEHIND, ANY)
                                .logoRect();

                assertTrue(logo.getWidth() > 0f, "aspect " + broken + " produced no width");
                assertTrue(logo.getHeight() > 0f, "aspect " + broken + " produced no height");
                assertEquals(1f, logo.getWidth() / logo.getHeight(), 0.05f);
            }
        }
    }
}
