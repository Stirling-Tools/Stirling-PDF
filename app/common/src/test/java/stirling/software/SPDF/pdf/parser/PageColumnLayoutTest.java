package stirling.software.SPDF.pdf.parser;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

/** Unit tests for {@link PageColumnLayout} gutter detection and column classification. */
class PageColumnLayoutTest {

    private static final float PAGE_WIDTH = 612f; // Letter portrait

    // ── single-column ────────────────────────────────────────────────────────────────────────────

    @Test
    void singleColumn_oneColumnNoGutters() {
        List<float[]> lines = List.of(lineBox(72f, 396f));

        PageColumnLayout layout = PageColumnLayout.fromLineBoxes(lines, PAGE_WIDTH);

        assertThat(layout.columnCount()).isEqualTo(1);
        assertThat(layout.gutters()).isEmpty();
    }

    @Test
    void singleColumn_classifyAnchor_returnsZero() {
        PageColumnLayout layout =
                PageColumnLayout.fromLineBoxes(List.of(lineBox(72f, 396f)), PAGE_WIDTH);

        assertThat(layout.columnOf(100f, 200f)).isEqualTo(0);
    }

    // ── two-column ───────────────────────────────────────────────────────────────────────────────

    @Test
    void twoColumn_detectsGutter() {
        PageColumnLayout layout =
                PageColumnLayout.fromLineBoxes(buildTwoColumnLines(3), PAGE_WIDTH);

        assertThat(layout.columnCount()).isEqualTo(2);
        assertThat(layout.gutters()).hasSize(1);
        float[] gutter = layout.gutters().get(0);
        // Gutter is centered on pageWidth/2 with PageColumnLayout.MIDPOINT_SLACK_PT slack each
        // side.
        float pageMid = PAGE_WIDTH / 2f;
        assertThat(gutter[0]).isBetween(pageMid - 40f, pageMid - 20f);
        assertThat(gutter[1]).isBetween(pageMid + 20f, pageMid + 40f);
    }

    @Test
    void twoColumn_classifyLeftAndRightAnchors() {
        PageColumnLayout layout =
                PageColumnLayout.fromLineBoxes(buildTwoColumnLines(3), PAGE_WIDTH);
        assertThat(layout.columnOf(100f, 200f)).isEqualTo(0);
        assertThat(layout.columnOf(380f, 460f)).isEqualTo(1);
    }

    @Test
    void twoColumn_columnsCrossing_leftLineOnlyHitsLeft() {
        PageColumnLayout layout =
                PageColumnLayout.fromLineBoxes(buildTwoColumnLines(3), PAGE_WIDTH);
        assertThat(layout.columnsCrossing(72f, 280f)).containsExactly(0);
        assertThat(layout.columnsCrossing(320f, 540f)).containsExactly(1);
    }

    @Test
    void twoColumn_spanningLine_returnsBothColumns() {
        List<float[]> lines = new ArrayList<>(buildTwoColumnLines(3));
        // Full-width header that crosses pageWidth/2.
        lines.add(lineBox(72f, 396f));

        PageColumnLayout layout = PageColumnLayout.fromLineBoxes(lines, PAGE_WIDTH);

        assertThat(layout.columnsCrossing(72f, 540f)).containsExactly(0, 1);
        assertThat(layout.columnsCrossing(72f, 280f)).containsExactly(0);
    }

    private static List<float[]> buildTwoColumnLines(int rowsPerColumn) {
        List<float[]> lines = new ArrayList<>();
        for (int i = 0; i < rowsPerColumn; i++) {
            lines.add(lineBox(72f, 136f)); // left column body (72..208)
            lines.add(lineBox(320f, 220f)); // right column body (320..540)
        }
        return lines;
    }

    // ── three-column ─────────────────────────────────────────────────────────────────────────────

    @Test
    void threeColumn_collapsesToLeftRightSplit() {
        // The midpoint-based detector splits the page at pageWidth/2 and treats anything else as
        // single-column or spanning. A genuine 3-column layout collapses to 2 columns; the middle
        // column's content ends up classified by midpoint as left or right of pageMid.
        List<float[]> lines = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            lines.add(lineBox(72f, 150f)); // 72..222
            lines.add(lineBox(252f, 150f)); // 252..402
            lines.add(lineBox(432f, 150f)); // 432..582
        }

        PageColumnLayout layout = PageColumnLayout.fromLineBoxes(lines, PAGE_WIDTH);

        assertThat(layout.columnCount()).isEqualTo(2);
        assertThat(layout.gutters()).hasSize(1);
    }

    // ── empty page ───────────────────────────────────────────────────────────────────────────────

    @Test
    void emptyPage_singleColumnFallback() {
        PageColumnLayout layout = PageColumnLayout.fromLineBoxes(List.of(), PAGE_WIDTH);
        assertThat(layout.columnCount()).isEqualTo(1);
        assertThat(layout.gutters()).isEmpty();
    }

    @Test
    void onlyShortFragments_singleColumnFallback() {
        // Page numbers / decorations — too narrow to vote either side.
        List<float[]> lines = List.of(lineBox(300f, 6f));
        PageColumnLayout layout = PageColumnLayout.fromLineBoxes(lines, PAGE_WIDTH);
        assertThat(layout.columnCount()).isEqualTo(1);
    }

    // ── narrow gap should not be confused for a gutter ───────────────────────────────────────────

    @Test
    void narrowInternalGap_doesNotProduceGutter() {
        // Both halves sit left of the page midpoint, so no line votes for a right column and
        // detection falls back to single-column.
        List<float[]> lines = new ArrayList<>();
        lines.add(lineBox(72f, 100f));
        lines.add(lineBox(180f, 100f));
        for (int i = 0; i < 5; i++) {
            lines.add(lineBox(72f, 208f));
        }

        PageColumnLayout layout = PageColumnLayout.fromLineBoxes(lines, PAGE_WIDTH);
        assertThat(layout.columnCount()).isEqualTo(1);
    }

    // ── helpers ──────────────────────────────────────────────────────────────────────────────────

    /** Builds a line bounding box {@code [x1, 0, x1+width, 0]}; Y is unused by detection. */
    private static float[] lineBox(float x1, float width) {
        return new float[] {x1, 0f, x1 + width, 0f};
    }
}
