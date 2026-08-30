package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Tests for {@link SignatureAppearanceLayout}. The class exists so the text fills the box the user
 * drew without ever escaping it, so most cases assert the geometry directly: measured widths and
 * baselines against the box, rather than just "a layout came back".
 */
class SignatureAppearanceLayoutTest {

    private static final PDType1Font FONT = new PDType1Font(FontName.TIMES_BOLD);

    /** Ink extents of Times-Bold, from its font bounding box. */
    private static final float TOP = 0.935f;

    private static final float BOTTOM = 0.218f;

    private static List<SignatureAppearanceLayout.Field> fields(String... labelsAndValues) {
        List<SignatureAppearanceLayout.Field> fields = new ArrayList<>();
        for (int i = 0; i < labelsAndValues.length; i += 2) {
            fields.add(
                    new SignatureAppearanceLayout.Field(
                            labelsAndValues[i], labelsAndValues[i + 1], false));
        }
        return fields;
    }

    /** Width the layout's widest line would actually occupy when drawn. */
    private static float widestDrawnLine(SignatureAppearanceLayout.Layout layout)
            throws IOException {
        float widest = 0f;
        for (SignatureAppearanceLayout.Line line : layout.lines()) {
            widest =
                    Math.max(
                            widest,
                            line.x() + FONT.getStringWidth(line.text()) / 1000f * line.fontSize());
        }
        return widest;
    }

    /** Top of the first line's ink, measured down from the top of the box. */
    private static float inkTop(SignatureAppearanceLayout.Layout layout) {
        SignatureAppearanceLayout.Line first = layout.lines().get(0);
        return first.baselineFromTop() - TOP * first.fontSize();
    }

    /** Bottom of the last line's ink, measured down from the top of the box. */
    private static float inkBottom(SignatureAppearanceLayout.Layout layout) {
        SignatureAppearanceLayout.Line last = layout.lines().get(layout.lines().size() - 1);
        return last.baselineFromTop() + BOTTOM * last.fontSize();
    }

    /** The whole text of a layout, with the line breaks taken back out. */
    private static String joined(SignatureAppearanceLayout.Layout layout) {
        return String.join(
                " ", layout.lines().stream().map(SignatureAppearanceLayout.Line::text).toList());
    }

    @Nested
    @DisplayName("Filling the box")
    class Filling {

        @Test
        @DisplayName("A roomy box grows the type instead of leaving the space empty")
        void roomyBoxGrowsTheType() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            fields(
                                    "Signed by", "Samuel Saez",
                                    "Date", "2026-08-03 12:00:00 CET",
                                    "Reason", "Conformidad"),
                            FONT,
                            400f,
                            200f);

            // The old rule capped the type at 12pt whatever the box, which is the defect the
            // reviewer photographed: three fields adrift in a large empty rectangle.
            assertTrue(
                    layout.fontSize() > 12f,
                    "expected the type to grow past the old ceiling, got " + layout.fontSize());
            assertTrue(inkBottom(layout) <= 200f + 0.01f);
        }

        @Test
        @DisplayName("The block fills the height it was given")
        void blockFillsTheHeight() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            fields(
                                    "Signed by", "Samuel Saez",
                                    "Organisation", "IMGA",
                                    "Date", "2026-08-03 12:00:00 CET",
                                    "Reason", "Conformidad",
                                    "Location", "Toledo"),
                            FONT,
                            300f,
                            120f);

            float used = inkBottom(layout) - inkTop(layout);
            float available = 120f - 2 * (120f * 0.04f);
            assertTrue(
                    used >= available * 0.95f,
                    "the block used " + used + "pt of " + available + " available");
        }

        @Test
        @DisplayName("The same fields in a bigger box come out bigger")
        void resultScalesWithTheBox() throws IOException {
            List<SignatureAppearanceLayout.Field> fields =
                    fields("Signed by", "Samuel Saez", "Date", "2026-08-03", "Reason", "Test");

            SignatureAppearanceLayout.Layout small =
                    SignatureAppearanceLayout.fit(fields, FONT, 300f, 120f);
            SignatureAppearanceLayout.Layout large =
                    SignatureAppearanceLayout.fit(fields, FONT, 600f, 240f);

            // Doubling the box doubles the type: the signature looks the same, only larger.
            assertEquals(2f, large.fontSize() / small.fontSize(), 0.1f);
        }

        @ParameterizedTest
        @ValueSource(ints = {1, 2, 3, 4, 5})
        @DisplayName("Fewer fields never means smaller type")
        void fewerFieldsNeverMeansSmallerType(int count) throws IOException {
            String[] all = {
                "Signed by", "Samuel Saez",
                "Organisation", "IMGA",
                "Date", "2026-08-03 12:00:00 CET",
                "Reason", "Conformidad",
                "Location", "Toledo"
            };

            SignatureAppearanceLayout.Layout fewer =
                    SignatureAppearanceLayout.fit(
                            fields(java.util.Arrays.copyOf(all, count * 2)), FONT, 300f, 120f);
            SignatureAppearanceLayout.Layout more =
                    SignatureAppearanceLayout.fit(fields(all), FONT, 300f, 120f);

            assertTrue(
                    fewer.fontSize() >= more.fontSize(),
                    count
                            + " fields came out at "
                            + fewer.fontSize()
                            + " against "
                            + more.fontSize());
        }

        @Test
        @DisplayName("A narrow box uses a smaller type than a wide one")
        void narrowBoxShrinksType() throws IOException {
            List<SignatureAppearanceLayout.Field> fields =
                    fields("Signed by", "Samuel Saez Rodriguez de la Fuente");

            SignatureAppearanceLayout.Layout big =
                    SignatureAppearanceLayout.fit(fields, FONT, 400f, 60f);
            SignatureAppearanceLayout.Layout small =
                    SignatureAppearanceLayout.fit(fields, FONT, 150f, 60f);

            assertTrue(
                    small.fontSize() < big.fontSize(),
                    "narrow box should use a smaller type size than a wide one");
            assertTrue(
                    widestDrawnLine(small) <= 150f,
                    "text overflowed the box: " + widestDrawnLine(small));
        }

        @Test
        @DisplayName("The chosen size lands on the quarter-point grid")
        void sizeIsAnExactQuarterPoint() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            fields("Signed by", "Samuel Saez"), FONT, 271f, 83f);

            float quarters = layout.fontSize() * 4f;
            assertEquals(Math.rint(quarters), quarters, 0f);
        }
    }

    @Nested
    @DisplayName("Staying inside the box")
    class Containment {

        @Test
        @DisplayName("Every line fits within the box width at the chosen size")
        void linesNeverOverflowWidth() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            fields(
                                    "Signed by", "Samuel Saez",
                                    "Issued by", "Autoridad de Certificacion Espanola",
                                    "Serial", "1a2b3c4d5e6f",
                                    "Valid until", "2027-01-01 00:00:00 CET"),
                            FONT,
                            220f,
                            90f);

            assertTrue(
                    widestDrawnLine(layout) <= 220f,
                    "widest line " + widestDrawnLine(layout) + " exceeded box width 220");
        }

        @ParameterizedTest
        @ValueSource(floats = {40f, 60f, 90f, 120f, 200f})
        @DisplayName("The ink never leaves the box, whatever its height")
        void inkNeverLeavesTheBox(float boxHeight) throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            fields(
                                    "Signed by", "Samuel Saez",
                                    "Date", "2026-08-03 12:00:00 CET",
                                    "Reason", "Conformidad"),
                            FONT,
                            250f,
                            boxHeight);

            assertFalse(layout.isEmpty());
            assertTrue(inkTop(layout) >= -0.01f, "the first line rose above the box");
            assertTrue(
                    inkBottom(layout) <= boxHeight + 0.01f,
                    "the last line fell " + (inkBottom(layout) - boxHeight) + "pt below the box");
        }

        @Test
        @DisplayName("The block is centred in the height left over")
        void blockIsCentred() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            fields("Signed by", "Samuel Saez"), FONT, 300f, 100f);

            assertEquals(inkTop(layout), 100f - inkBottom(layout), 0.01f);
        }
    }

    @Nested
    @DisplayName("Text longer than the line")
    class Wrapping {

        @Test
        @DisplayName("A long value is carried onto the next line rather than cut short")
        void wrapsInsteadOfTruncating() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            fields("Signed by", "ASSESSORIA EM NEGOCIOS LTDA SYNGULARID MULTIPLA"),
                            FONT,
                            140f,
                            90f);

            assertTrue(layout.lines().size() > 1, "expected the value to wrap");
            for (SignatureAppearanceLayout.Line line : layout.lines()) {
                assertFalse(line.text().endsWith("..."), "wrapped text should not be cut short");
            }
            assertEquals(
                    "Signed by: ASSESSORIA EM NEGOCIOS LTDA SYNGULARID MULTIPLA", joined(layout));
        }

        @Test
        @DisplayName("A word with nowhere to break is split rather than shrinking the signature")
        void splitsAWordThatCannotFit() throws IOException {
            String serial = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b";

            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(fields("Serial", serial), FONT, 90f, 70f);

            assertTrue(layout.lines().size() > 1, "expected the serial to be split");
            // Nothing is lost to the split, wherever the breaks landed.
            assertEquals(("Serial: " + serial).replace(" ", ""), joined(layout).replace(" ", ""));
            for (SignatureAppearanceLayout.Line line : layout.lines()) {
                assertFalse(line.text().endsWith("..."), "a serial must not be cut short");
            }
        }

        @Test
        @DisplayName("A continuation line is indented under its label")
        void continuationIsIndented() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            fields("Signed by", "ASSESSORIA EM NEGOCIOS LTDA SYNGULARID"),
                            FONT,
                            140f,
                            90f);

            assertTrue(layout.lines().size() > 1);
            assertTrue(
                    layout.lines().get(1).x() > layout.lines().get(0).x(),
                    "the continuation should sit under the value, not under the label");
        }
    }

    @Nested
    @DisplayName("The headline field")
    class Headline {

        @Test
        @DisplayName("The signer's name is drawn larger than the rest")
        void headlineIsLarger() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            List.of(
                                    new SignatureAppearanceLayout.Field(
                                            "Signed by", "Samuel Saez", true),
                                    new SignatureAppearanceLayout.Field(
                                            "Date", "2026-08-03", false)),
                            FONT,
                            300f,
                            120f);

            assertEquals(
                    1.6f,
                    layout.lines().get(0).fontSize() / layout.fontSize(),
                    0.01f,
                    "the headline should be drawn larger than the body");
        }

        @Test
        @DisplayName("Without a headline every line is the same size")
        void withoutHeadlineEveryLineMatches() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            fields("Organisation", "IMGA", "Date", "2026-08-03"), FONT, 300f, 120f);

            for (SignatureAppearanceLayout.Line line : layout.lines()) {
                assertEquals(layout.fontSize(), line.fontSize(), 0.01f);
            }
        }
    }

    @Nested
    @DisplayName("Boxes too small for the content")
    class Cramped {

        @Test
        @DisplayName("A tiny box keeps the leading lines instead of drawing nothing")
        void keepsLeadingLines() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            fields(
                                    "Signed by", "Samuel Saez",
                                    "Issued by", "Autoridad",
                                    "Serial", "1a2b3c",
                                    "Valid until", "2027-01-01"),
                            FONT,
                            200f,
                            14f);

            assertFalse(layout.lines().isEmpty(), "a cramped box should still show something");
            assertTrue(inkBottom(layout) <= 14f + 0.01f);
            // The signer's name is the one thing worth keeping when space runs out.
            assertTrue(layout.lines().get(0).text().startsWith("Signed by"));
        }

        @Test
        @DisplayName("Dropping content leaves a mark saying there was more")
        void marksWhatItDropped() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            fields(
                                    "Signed by", "Samuel Saez",
                                    "Issued by", "Autoridad",
                                    "Serial", "1a2b3c",
                                    "Valid until", "2027-01-01"),
                            FONT,
                            200f,
                            14f);

            assertTrue(layout.lines().size() < 4, "it cannot have fitted all four fields");
            assertTrue(
                    layout.lines().get(layout.lines().size() - 1).text().endsWith("..."),
                    "the last line should say the rest was dropped");
        }

        @Test
        @DisplayName("A whole value keeps every character when the fields after it are dropped")
        void neverEatsAWholeValue() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            fields(
                                    "Signed by", "Samuel Saez",
                                    "Serial", "1a2b3c",
                                    "Valid until", "2027-01-01",
                                    "Location", "Spain"),
                            FONT,
                            200f,
                            14f);

            for (SignatureAppearanceLayout.Line line : layout.lines()) {
                String text = line.text();
                if (!text.endsWith("...")) {
                    continue;
                }
                // The mark may only ride on a value the box cut in half. On a whole one it follows
                // a space, so "Serial: 1a2b3c ..." cannot be read as a longer serial number.
                assertTrue(
                        text.endsWith(" ..."),
                        "a dropped field must not make a whole value look shortened: " + text);
            }
        }

        @Test
        @DisplayName("An area too narrow to name the signer yields nothing to draw")
        void tooNarrowToSayAnything() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            fields("Signed by", "Samuel Saez"), FONT, 20f, 40f);

            assertTrue(layout.isEmpty());
        }

        @Test
        @DisplayName("A box with no usable space yields no lines rather than failing")
        void degenerateBox() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(fields("Signed by", "Samuel Saez"), FONT, 1f, 1f);

            assertTrue(layout.lines().isEmpty());
        }

        @Test
        @DisplayName("No fields yields an empty layout rather than an exception")
        void noFields() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(List.of(), FONT, 200f, 50f);

            assertTrue(layout.lines().isEmpty());
        }

        @Test
        @DisplayName("A box of nonsense dimensions yields no lines rather than failing")
        void nonFiniteBox() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            fields("Signed by", "Samuel Saez"), FONT, Float.NaN, 50f);

            assertTrue(layout.lines().isEmpty());
        }
    }
}
