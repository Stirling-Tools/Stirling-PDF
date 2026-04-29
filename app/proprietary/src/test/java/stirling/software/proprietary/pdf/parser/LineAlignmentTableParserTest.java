package stirling.software.proprietary.pdf.parser;

import static org.assertj.core.api.Assertions.assertThat;
import static stirling.software.proprietary.pdf.parser.PdfModels.*;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link LineAlignmentTableParser}, focused on the coincident-line merge logic and
 * column-grid construction.
 */
class LineAlignmentTableParserTest {

    private final LineAlignmentTableParser parser = new LineAlignmentTableParser();

    // ── mergeCoincidentLines ─────────────────────────────────────────────────────────────────────

    @Test
    void mergeCoincidentLines_singleLine_unchanged() {
        var lines = List.of(tokenized(rawLine(10f, 100f, "Revenue")));
        assertThat(parser.mergeCoincidentLines(lines)).hasSize(1);
    }

    @Test
    void mergeCoincidentLines_distinctYLines_unchanged() {
        // Two lines at different y positions — must NOT be merged.
        var lines =
                List.of(
                        tokenized(rawLine(10f, 100f, "Revenue")),
                        tokenized(rawLine(10f, 115f, "Cost")));
        assertThat(parser.mergeCoincidentLines(lines)).hasSize(2);
    }

    @Test
    void mergeCoincidentLines_sameY_merged() {
        // Simulates a financial-table row split by LineBuilder at the column gap:
        //   label fragment at x=72  → "Revenue"
        //   value fragment at x=350 → "1,234"
        // Both have y=100. After merge they should form one TokenizedLine.
        var label = rawLine(72f, 100f, "Revenue");
        var value = rawLine(350f, 100f, "1,234");

        var merged = parser.mergeCoincidentLines(List.of(tokenized(label), tokenized(value)));

        assertThat(merged).hasSize(1);
        // The merged line should contain tokens from both halves.
        var tokens = merged.get(0).all();
        assertThat(tokens.stream().map(t -> t.text()).toList())
                .containsExactlyInAnyOrder("Revenue", "1,234");
    }

    @Test
    void mergeCoincidentLines_sameY_mergedLineHasCorrectBounds() {
        var label = rawLine(72f, 100f, "Revenue"); // 7 chars × 6pt = 42pt wide → right = 114
        var value = rawLine(350f, 100f, "1,234"); // 5 chars × 6pt = 30pt wide → right = 380

        var merged = parser.mergeCoincidentLines(List.of(tokenized(label), tokenized(value)));

        var bounds = merged.get(0).line().bounds();
        assertThat(bounds.x()).isEqualTo(72f);
        assertThat(bounds.right()).isEqualTo(380f);
    }

    @Test
    void mergeCoincidentLines_withinTolerance_merged() {
        // Lines 1.5pt apart (within ROW_MERGE_TOLERANCE_PT = 2pt) should merge.
        var a = rawLine(10f, 100.0f, "Alpha");
        var b = rawLine(200f, 101.5f, "99");

        var merged = parser.mergeCoincidentLines(List.of(tokenized(a), tokenized(b)));
        assertThat(merged).hasSize(1);
    }

    @Test
    void mergeCoincidentLines_beyondTolerance_notMerged() {
        // Lines 3pt apart (beyond ROW_MERGE_TOLERANCE_PT = 2pt) should NOT merge.
        var a = rawLine(10f, 100.0f, "Alpha");
        var b = rawLine(200f, 103.0f, "99");

        var merged = parser.mergeCoincidentLines(List.of(tokenized(a), tokenized(b)));
        assertThat(merged).hasSize(2);
    }

    @Test
    void mergeCoincidentLines_threeCoincident_allMerged() {
        // Three fragments at the same y (e.g. wide financial table with two value columns).
        var a = rawLine(72f, 100f, "Revenue");
        var b = rawLine(300f, 100f, "1,234");
        var c = rawLine(400f, 100f, "5,678");

        var merged = parser.mergeCoincidentLines(List.of(tokenized(a), tokenized(b), tokenized(c)));
        assertThat(merged).hasSize(1);
        assertThat(merged.get(0).all()).hasSize(3);
    }

    @Test
    void mergeCoincidentLines_coincidentPairFollowedByDistinctLine_twoGroups() {
        var a = rawLine(72f, 100f, "Revenue");
        var b = rawLine(350f, 100f, "1,234"); // same y as a → merges with a
        var c = rawLine(10f, 115f, "Expenses"); // different y → stays separate

        var merged = parser.mergeCoincidentLines(List.of(tokenized(a), tokenized(b), tokenized(c)));
        assertThat(merged).hasSize(2);
    }

    @Test
    void mergeCoincidentLines_numericAnchorStatus_correctAfterMerge() {
        // After merging, the combined line should be an anchor (≥2 numeric tokens).
        // "Revenue" alone → not an anchor. "1,234  567" alone → anchor.
        // Merged → anchor with at least 2 numerics.
        var label = rawLine(72f, 100f, "Revenue");
        var values = rawLineMultiWord(350f, 100f, "1,234", 30f, "567", 30f);

        var merged = parser.mergeCoincidentLines(List.of(tokenized(label), tokenized(values)));

        assertThat(merged).hasSize(1);
        assertThat(merged.get(0).isAnchor()).isTrue();
    }

    // ── helpers ──────────────────────────────────────────────────────────────────────────────────

    /** Creates a RawLine with a single TextFragment of the given text at the given position. */
    private static RawLine rawLine(float x, float y, String text) {
        float width = text.length() * 6f; // ~6pt per char — rough but consistent
        float height = 12f;
        Bounds bounds = new Bounds(x, y, width, height);
        TextFragment fragment =
                new TextFragment("tf-test", text, bounds, y + height, 11f, "Helvetica", false);
        return new RawLine("ln-test", List.of(fragment), bounds, 1);
    }

    /**
     * Creates a RawLine with two TextFragments representing two words separated by a small gap.
     * Used to simulate a values-only line with multiple numeric tokens.
     */
    private static RawLine rawLineMultiWord(
            float x, float y, String word1, float w1, String word2, float w2) {
        float height = 12f;
        Bounds b1 = new Bounds(x, y, w1, height);
        Bounds b2 = new Bounds(x + w1 + 5f, y, w2, height);
        TextFragment f1 = new TextFragment("tf-1", word1, b1, y + height, 11f, "Helvetica", false);
        TextFragment f2 = new TextFragment("tf-2", word2, b2, y + height, 11f, "Helvetica", false);
        Bounds lineBounds = new Bounds(x, y, x + w1 + 5f + w2 - x, height);
        return new RawLine("ln-test", List.of(f1, f2), lineBounds, 1);
    }

    /** Tokenises a RawLine via the parser's own tokenise logic (package-private access). */
    private LineAlignmentTableParser.TokenizedLine tokenized(RawLine line) {
        return parser.tokenize(line);
    }
}
