package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Tests for {@link SignatureAppearanceLayout}. The point of the class is that text never escapes
 * the box the user drew, so most cases assert the geometry directly: measured width and total
 * height against the box, rather than just "a layout came back".
 */
class SignatureAppearanceLayoutTest {

    private static final PDType1Font FONT = new PDType1Font(FontName.TIMES_BOLD);

    private static Map<String, String> entries(String... labelsAndValues) {
        Map<String, String> map = new LinkedHashMap<>();
        for (int i = 0; i < labelsAndValues.length; i += 2) {
            map.put(labelsAndValues[i], labelsAndValues[i + 1]);
        }
        return map;
    }

    /** Width the layout's widest line would actually occupy when drawn. */
    private static float widestDrawnLine(SignatureAppearanceLayout.Layout layout)
            throws IOException {
        float widest = 0f;
        for (String line : layout.lines()) {
            widest = Math.max(widest, FONT.getStringWidth(line) / 1000f * layout.fontSize());
        }
        return widest;
    }

    @Nested
    @DisplayName("Fitting text to the box")
    class Fitting {

        @Test
        @DisplayName("A roomy box keeps every line and uses a comfortable type size")
        void roomyBox() throws IOException {
            Map<String, String> fields = entries("Signed by", "Samuel Saez", "Date", "2026-08-03");

            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(fields, FONT, 300f, 100f);

            assertEquals(2, layout.lines().size());
            assertEquals("Signed by: Samuel Saez", layout.lines().get(0));
            assertTrue(
                    layout.fontSize() >= 8f, "expected a legible size, got " + layout.fontSize());
        }

        @Test
        @DisplayName("A narrow box shrinks the type rather than overflowing")
        void narrowBoxShrinksType() throws IOException {
            Map<String, String> fields = entries("Signed by", "Samuel Saez Rodriguez de la Fuente");

            SignatureAppearanceLayout.Layout big =
                    SignatureAppearanceLayout.fit(fields, FONT, 400f, 60f);
            SignatureAppearanceLayout.Layout small =
                    SignatureAppearanceLayout.fit(fields, FONT, 150f, 60f);

            assertTrue(
                    small.fontSize() < big.fontSize(),
                    "narrow box should use a smaller type size than a wide one");
            // The whole reason the class exists: the text stays inside the box.
            assertTrue(
                    widestDrawnLine(small) <= 150f,
                    "text overflowed the box: " + widestDrawnLine(small));
        }

        @Test
        @DisplayName("Every line fits within the box width at the chosen size")
        void linesNeverOverflowWidth() throws IOException {
            Map<String, String> fields =
                    entries(
                            "Signed by", "Samuel Saez",
                            "Issued by", "Autoridad de Certificacion Espanola",
                            "Serial", "1a2b3c4d5e6f",
                            "Valid until", "2027-01-01 00:00:00 CET");

            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(fields, FONT, 220f, 90f);

            assertTrue(
                    widestDrawnLine(layout) <= 220f,
                    "widest line " + widestDrawnLine(layout) + " exceeded box width 220");
        }

        @Test
        @DisplayName("All lines together fit within the box height")
        void linesNeverOverflowHeight() throws IOException {
            Map<String, String> fields =
                    entries(
                            "Signed by", "Samuel Saez",
                            "Organisation", "IMGA",
                            "Date", "2026-08-03 12:00:00 CET",
                            "Reason", "Conformidad",
                            "Location", "Toledo");

            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(fields, FONT, 300f, 70f);

            float used = layout.lines().size() * layout.leading() + 2 * layout.padding();
            assertTrue(used <= 70f + 0.01f, "text block of " + used + "pt exceeded box height 70");
        }
    }

    @Nested
    @DisplayName("Boxes too small for the content")
    class Cramped {

        @Test
        @DisplayName("A tiny box keeps the leading lines instead of drawing nothing")
        void keepsLeadingLines() throws IOException {
            Map<String, String> fields =
                    entries(
                            "Signed by", "Samuel Saez",
                            "Issued by", "Autoridad",
                            "Serial", "1a2b3c",
                            "Valid until", "2027-01-01");

            // Only tall enough for a line or two at the minimum size.
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(fields, FONT, 200f, 14f);

            assertFalse(layout.lines().isEmpty(), "a cramped box should still show something");
            assertTrue(layout.lines().size() < 4, "it cannot have fitted all four lines");
            // The signer's name is the one thing worth keeping when space runs out.
            assertTrue(layout.lines().get(0).startsWith("Signed by"));
        }

        @Test
        @DisplayName("A line too wide even at minimum size is ellipsised, not overflowed")
        void ellipsisesRatherThanOverflow() throws IOException {
            Map<String, String> fields =
                    entries("Signed by", "Samuel Saez Rodriguez de la Fuente y Villanueva");

            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(fields, FONT, 40f, 12f);

            if (!layout.lines().isEmpty()) {
                assertTrue(
                        widestDrawnLine(layout) <= 40f,
                        "ellipsised line still overflowed: " + widestDrawnLine(layout));
            }
        }

        @Test
        @DisplayName("A box with no usable space yields no lines rather than failing")
        void degenerateBox() throws IOException {
            Map<String, String> fields = entries("Signed by", "Samuel Saez");

            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(fields, FONT, 1f, 1f);

            assertTrue(layout.lines().isEmpty());
        }

        @Test
        @DisplayName("No fields yields an empty layout rather than an exception")
        void noFields() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(Map.of(), FONT, 200f, 50f);

            assertTrue(layout.lines().isEmpty());
        }
    }

    @Nested
    @DisplayName("Baseline placement")
    class Baselines {

        @Test
        @DisplayName("The first baseline sits below the top padding, not on the box edge")
        void firstBaselineBelowPadding() throws IOException {
            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            entries("Signed by", "Samuel Saez"), FONT, 300f, 100f);

            // Drawing at the very top edge would clip the ascenders.
            assertTrue(layout.firstBaselineFromTop() > layout.padding());
            assertEquals(
                    layout.padding() + layout.fontSize(), layout.firstBaselineFromTop(), 0.01f);
        }
    }
}
