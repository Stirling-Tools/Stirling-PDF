package stirling.software.proprietary.pdf.ua;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Tests the heuristics that decide what counts as a drawing and what counts as a heading. */
class VectorAndHeadingTest {

    private static final BBox A4 = new BBox(0, 0, 595, 842);

    private static TextLineInfo line(String text, float size, float x, float y) {
        List<WordInfo> words = new ArrayList<>();
        float cursor = x;
        for (String token : text.strip().split("\\s+")) {
            float width = token.length() * size * 0.5f;
            words.add(
                    new WordInfo(
                            token,
                            new BBox(cursor, y, cursor + width, y + size),
                            0,
                            0,
                            size,
                            false));
            cursor += width + size * 0.3f;
        }
        return new TextLineInfo(
                0, text, new BBox(x, y, cursor, y + size), size, false, 0, 0, false, words);
    }

    private static MarkableOp vector(int ordinal, BBox box) {
        return new MarkableOp(ordinal, MarkableOp.Kind.VECTOR, box, null);
    }

    private static DocumentStructure analyse(List<TextLineInfo> lines, List<MarkableOp> ops) {
        PageContent page = new PageContent(0, lines, ops, ops.size(), false, false, false, A4);
        return new LayoutAnalyzer().analyse(List.of(page));
    }

    private static long countOf(DocumentStructure structure, StructType type) {
        long[] total = {0};
        structure.visit(
                block -> {
                    if (block.getType() == type) {
                        total[0]++;
                    }
                });
        return total[0];
    }

    @Test
    @DisplayName("a cluster of substantial strokes becomes a figure, not silent decoration")
    void chartBecomesAFigure() {
        List<MarkableOp> bars = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            bars.add(vector(i, new BBox(100 + i * 20, 400, 115 + i * 20, 400 + 30 + i * 10)));
        }
        DocumentStructure structure = analyse(List.of(), bars);

        assertTrue(
                countOf(structure, StructType.FIGURE) > 0,
                "a bar chart drawn with path operators must not vanish as decoration");
        assertTrue(
                structure.figuresWithoutAlt().size() > 0,
                "the report must say the chart needs a description");
    }

    @Test
    @DisplayName("thin rules and table borders stay artifacts")
    void tableRulesStayDecoration() {
        List<MarkableOp> rules = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            rules.add(vector(i, new BBox(60, 700 - i * 20, 540, 701 - i * 20)));
        }
        DocumentStructure structure = analyse(List.of(), rules);

        assertEquals(
                0,
                countOf(structure, StructType.FIGURE),
                "horizontal rules are page furniture and must not demand alt text");
        assertEquals(0, structure.figuresWithoutAlt().size());
    }

    @Test
    @DisplayName("a lone box is ornament, not a chart")
    void singleBoxIsNotAFigure() {
        DocumentStructure structure =
                analyse(List.of(), List.of(vector(0, new BBox(60, 400, 500, 700))));
        assertEquals(0, countOf(structure, StructType.FIGURE));
    }

    @Test
    @DisplayName("shaded table rows behind text are not mistaken for a chart")
    void shadedTableRowsAreNotFigures() {
        List<MarkableOp> shading = new ArrayList<>();
        List<TextLineInfo> rows = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            float y = 600 - i * 20;
            // A filled row background, tall enough to pass the thinness test.
            shading.add(vector(i, new BBox(60, y, 540, y + 16)));
            rows.add(line("Expense line item " + i + " amount", 10, 64, y + 3));
        }
        DocumentStructure structure = analyse(rows, shading);

        assertEquals(
                0,
                countOf(structure, StructType.FIGURE),
                "row shading sits behind the text it decorates and is not a drawing");
    }

    @Test
    @DisplayName("small print dominating an invoice does not promote addresses to headings")
    void smallPrintDoesNotCreateHeadings() {
        List<TextLineInfo> lines = new ArrayList<>();
        // Address block at ordinary 11pt.
        lines.add(line("Acme Industries Limited", 11, 60, 780));
        lines.add(line("14 Example Street", 11, 60, 765));
        lines.add(line("Manchester M1 2AB", 11, 60, 750));
        // 40 lines of 9pt line-item small print, which dominates the character count.
        for (int i = 0; i < 40; i++) {
            lines.add(line("Item " + i + " widget assembly part number " + i, 9, 60, 700 - i * 12));
        }

        Map<Float, Integer> tiers =
                LayoutAnalyzer.headingTiers(
                        List.of(new PageContent(0, lines, List.of(), 0, false, false, false, A4)),
                        9f);
        assertNull(
                tiers.get(11f),
                "11pt address lines are body text on an invoice, not headings: " + tiers);
    }

    @Test
    @DisplayName("a genuinely rare large size is still a heading")
    void realHeadingsSurvive() {
        List<TextLineInfo> lines = new ArrayList<>();
        lines.add(line("Annual Report", 24, 60, 780));
        for (int i = 0; i < 40; i++) {
            lines.add(
                    line("Body prose line number " + i + " continues here", 11, 60, 700 - i * 12));
        }
        Map<Float, Integer> tiers =
                LayoutAnalyzer.headingTiers(
                        List.of(new PageContent(0, lines, List.of(), 0, false, false, false, A4)),
                        11f);
        assertEquals(1, tiers.get(24f), "a rare large size is exactly what a heading looks like");
    }
}
