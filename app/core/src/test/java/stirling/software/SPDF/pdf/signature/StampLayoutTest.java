package stirling.software.SPDF.pdf.signature;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.function.ToDoubleFunction;

import org.junit.jupiter.api.Test;

class StampLayoutTest {

    private static final ToDoubleFunction<String> HALF_EM = line -> line.length() * 0.5;

    private static final List<String> DETAILS =
            List.of("Digitally signed by Ada", "Date: 2026.11.24 10:12:05 +00'00'");

    @Test
    void aWideBoxPutsTheNameLeftAndTheDetailsRight() {
        StampLayout layout = StampLayout.of(200, 50, "Ada", 0, DETAILS, HALF_EM);
        assertNull(layout.logo());
        assertNotNull(layout.name());
        assertEquals(2, layout.name().lefts().getFirst(), 0.01);
        assertEquals(2 + 97 + 2, layout.details().lefts().getFirst(), 0.01);
        assertTrue(layout.name().fontSize() > layout.details().fontSize());
    }

    @Test
    void aTallBoxPutsTheGraphicAboveTheDetails() {
        StampLayout layout = StampLayout.of(80, 200, "Ada", 0, DETAILS, HALF_EM);
        float nameBottom = layout.name().baselines().getLast();
        float detailsTop = layout.details().baselines().getFirst() + layout.details().fontSize();
        assertTrue(nameBottom > detailsTop, nameBottom + " vs " + detailsTop);
    }

    @Test
    void aLogoReplacesTheNameAndKeepsItsShapeInItsHalf() {
        StampLayout layout = StampLayout.of(200, 50, "Ada", 3, DETAILS, HALF_EM);
        assertNull(layout.name());
        StampLayout.Rect logo = layout.logo();
        assertEquals(3, logo.width() / logo.height(), 0.01);
        assertTrue(logo.x() + logo.width() <= layout.details().lefts().getFirst());
    }

    @Test
    void longDetailsWrapRatherThanShrinkTheWholeBlock() {
        String reason =
                "Reason: Approved on behalf of the board following the quarterly compliance"
                        + " review of all supplier contracts";
        List<String> details = List.of(DETAILS.get(0), DETAILS.get(1), reason);
        StampLayout layout = StampLayout.of(300, 90, "Ada", 0, details, HALF_EM);

        assertTrue(layout.details().lines().size() > 3, layout.details().lines().toString());
        float halfWidth = (300 - 3 * 3.6f) / 2;
        for (String line : layout.details().lines()) {
            assertTrue(line.length() * 0.5 * layout.details().fontSize() <= halfWidth + 0.01, line);
        }
    }

    @Test
    void aBoxWithNoWidthIsLaidOutWithoutSearchingForAFit() {
        StampLayout layout = StampLayout.of(0, 50, "Ada", 0, DETAILS, HALF_EM);
        assertEquals(0, layout.details().fontSize(), 0.0001);
    }

    @Test
    void everyWrappedLineFitsWhenOneCharacterIsMuchWiderThanTheNext() {
        ToDoubleFunction<String> measure =
                line -> line.codePoints().mapToDouble(c -> c == '漢' ? 3 : 0.5).sum();
        String name = "ｱ漢ｱ漢ｱ漢ｱ漢";
        float width = 60;
        StampLayout layout = StampLayout.of(width, 200, name, 0, DETAILS, measure);
        float graphicWidth = width - 2 * width * 0.04f;
        for (String line : layout.name().lines()) {
            assertTrue(
                    measure.applyAsDouble(line) * layout.name().fontSize() <= graphicWidth + 0.01,
                    line);
        }
    }

    @Test
    void aWordWiderThanItsHalfBreaksBetweenCharacters() {
        String name = "山田太郎山田太郎山田太郎山田太郎山田太郎";
        StampLayout layout = StampLayout.of(120, 120, name, 0, DETAILS, HALF_EM);
        assertTrue(layout.name().lines().size() > 1, layout.name().lines().toString());
        assertEquals(name, String.join("", layout.name().lines()));
    }

    @Test
    void matchesTheFrontendPreviewOnTheSameInputs() {
        StampLayout layout = StampLayout.of(200, 50, "Ada", 0, DETAILS, HALF_EM);
        assertEquals(9.73, layout.details().fontSize(), 0.01);
        assertEquals(46, layout.name().fontSize(), 0.01);
    }

    @Test
    void aLatinWordIsNeverSplitMidWord() {
        String name = "Maximilian Alexander Featherstonehaugh-Cholmondeley the Third";
        StampLayout layout = StampLayout.of(200, 50, name, 0, DETAILS, HALF_EM);
        List<String> words = List.of(name.split(" "));
        for (String line : layout.name().lines()) {
            assertTrue(words.containsAll(List.of(line.split(" "))), line);
        }
        assertTrue(
                layout.name().lines().contains("Featherstonehaugh-Cholmondeley"),
                layout.name().lines().toString());
    }

    @Test
    void aRightToLeftLineAlignsRight() {
        StampLayout layout =
                StampLayout.of(
                        200,
                        50,
                        "Ada",
                        0,
                        List.of("\u05EA\u05D0\u05E8\u05D9\u05DA: 2026", "Date: 2026"),
                        HALF_EM);
        float right = 2 + 97 + 2 + 97;
        float hebrewEnd =
                layout.details().lefts().get(0)
                        + layout.details().lines().get(0).length()
                                * 0.5f
                                * layout.details().fontSize();
        assertEquals(right, hebrewEnd, 0.01);
        assertEquals(101, layout.details().lefts().get(1), 0.01);
    }

    @Test
    void aLineWrappedFromARightToLeftParagraphStaysRightAligned() {
        String hebrew = "\u05EA\u05D0\u05E8\u05D9\u05DA: 2026.11.24 16:22:50 +02'00'";
        StampLayout layout = StampLayout.of(120, 120, "Ada", 0, List.of(hebrew), HALF_EM);
        StampLayout.TextBlock details = layout.details();
        assertTrue(details.lines().size() > 1, details.lines().toString());
        for (int index = 0; index < details.lines().size(); index++) {
            float end =
                    details.lefts().get(index)
                            + details.lines().get(index).length() * 0.5f * details.fontSize();
            assertEquals(120 - 4.8f, end, 0.01);
        }
    }

    @Test
    void withNoGraphicTheDetailsFillTheBox() {
        StampLayout layout = StampLayout.of(200, 50, null, 0, DETAILS, HALF_EM);
        assertNull(layout.logo());
        assertNull(layout.name());
        assertEquals(2, layout.details().lefts().getFirst(), 0.01);
        StampLayout halves = StampLayout.of(200, 50, "Ada", 0, DETAILS, HALF_EM);
        assertTrue(layout.details().fontSize() > halves.details().fontSize());
    }

    @Test
    void theWatermarkIsCentredAndKeepsItsShape() {
        StampLayout.Rect mark = StampLayout.watermark(200, 50, 1);
        assertEquals(46, mark.width(), 0.01);
        assertEquals(46, mark.height(), 0.01);
        assertEquals((200 - 46) / 2f, mark.x(), 0.01);
        assertEquals(2, mark.y(), 0.01);
    }
}
