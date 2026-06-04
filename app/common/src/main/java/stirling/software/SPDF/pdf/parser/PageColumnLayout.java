package stirling.software.SPDF.pdf.parser;

import java.util.ArrayList;
import java.util.List;

/**
 * Detects whether a page is one- or two-column from per-line bounding boxes, and classifies an
 * X-span into the column it belongs to. Detection is a midpoint vote at {@code pageWidth / 2}.
 *
 * <p>Capped at two columns by design — sufficient for the redaction target set (single-column
 * documents and IEEE-style two-column papers). 3+ column layouts (newspapers, magazines) and
 * off-centre gutters (asymmetric two-column) would need a histogram or clustering approach to
 * detect the actual gutter X. (future work)
 *
 * <p>Coordinates are PDFTextStripper screen space (top-left origin, Y increases downward).
 */
public final class PageColumnLayout {

    /**
     * Slack when checking "crosses a gutter" so single-pixel overshoots don't mark a line as
     * spanning.
     */
    public static final float SPAN_SLACK_PT = 2f;

    /**
     * Slack on each side of the page midpoint inside which a line is considered "spanning"
     * (covering both columns) rather than belonging to one side.
     */
    private static final float MIDPOINT_SLACK_PT = 30f;

    /**
     * Minimum line width (points) for a line to count toward the two-column tally. Avoids false
     * positives where right-aligned dates, page numbers, or short "Link" fragments next to a
     * heading look like a second column when they're really just inline metadata.
     */
    private static final float MIN_COLUMN_LINE_WIDTH_PT = 100f;

    /**
     * Minimum number of clearly leftish AND clearly rightish lines (each of width &ge; {@link
     * #MIN_COLUMN_LINE_WIDTH_PT}) required to call the page two-column. Anything below this falls
     * back to single-column.
     */
    private static final int MIN_SIDE_LINES = 3;

    private final List<float[]> columns;
    private final List<float[]> gutters;

    private PageColumnLayout(List<float[]> columns, List<float[]> gutters) {
        this.columns = columns;
        this.gutters = gutters;
    }

    /**
     * Determines column layout from per-line bounding boxes ({@code [x1, _, x2, _]}). Counts lines
     * whose X-midpoint sits clearly left of, or clearly right of, the page midpoint (with {@link
     * #MIDPOINT_SLACK_PT} slack each side). If both sides have at least {@link #MIN_SIDE_LINES}
     * lines, the page is treated as two-column with the gutter at the page midpoint. Otherwise it's
     * single-column.
     *
     * <p>Cross-column lines must already be split: callers should feed boxes from a line extractor
     * that splits same-Y glyphs at large X gaps (see {@code AllTextLineExtractor}). Without that
     * split, IEEE-style aligned-baseline 2-column PDFs produce one wide merged box per row and the
     * side tallies all end up classified as "spanning", falling to single-column.
     */
    public static PageColumnLayout fromLineBoxes(List<float[]> lineBoxes, float pageWidth) {
        if (lineBoxes == null || lineBoxes.isEmpty()) {
            return new PageColumnLayout(List.of(new float[] {0f, pageWidth}), List.of());
        }
        float pageMid = pageWidth / 2f;
        int left = 0, right = 0;
        for (float[] lb : lineBoxes) {
            if (lb == null || lb.length < 3) continue;
            float width = lb[2] - lb[0];
            // Skip narrow lines — dates, page numbers, "Link" labels next to a heading should
            // not, on their own, make a single-column doc look two-column.
            if (width < MIN_COLUMN_LINE_WIDTH_PT) continue;
            float mid = (lb[0] + lb[2]) * 0.5f;
            if (mid < pageMid - MIDPOINT_SLACK_PT) left++;
            else if (mid > pageMid + MIDPOINT_SLACK_PT) right++;
        }
        if (left < MIN_SIDE_LINES || right < MIN_SIDE_LINES) {
            return new PageColumnLayout(List.of(new float[] {0f, pageWidth}), List.of());
        }
        float gutterL = pageMid - MIDPOINT_SLACK_PT;
        float gutterR = pageMid + MIDPOINT_SLACK_PT;
        return new PageColumnLayout(
                List.of(new float[] {0f, gutterL}, new float[] {gutterR, pageWidth}),
                List.of(new float[] {gutterL, gutterR}));
    }

    /** All columns, left-to-right, as {@code [leftX, rightX]} pairs. Never empty. */
    public List<float[]> columns() {
        return columns;
    }

    /** Gutters between columns, left-to-right, as {@code [leftX, rightX]} pairs. */
    public List<float[]> gutters() {
        return gutters;
    }

    public int columnCount() {
        return columns.size();
    }

    /**
     * Returns the column index containing the X-midpoint of {@code [x1, x2]}, falling back to the
     * closest column if the midpoint sits inside a gutter.
     */
    public int columnOf(float x1, float x2) {
        float mid = (x1 + x2) * 0.5f;
        int best = 0;
        float bestDist = Float.MAX_VALUE;
        for (int i = 0; i < columns.size(); i++) {
            float[] c = columns.get(i);
            if (mid >= c[0] && mid <= c[1]) return i;
            float dist = mid < c[0] ? c[0] - mid : mid - c[1];
            if (dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        }
        return best;
    }

    /**
     * Returns every column index whose X-range overlaps {@code [x1, x2]} with at least {@link
     * #SPAN_SLACK_PT} of intrusion. A normal in-column line returns one index; a line crossing a
     * gutter returns two or more.
     */
    public int[] columnsCrossing(float x1, float x2) {
        List<Integer> hits = new ArrayList<>();
        for (int i = 0; i < columns.size(); i++) {
            float[] c = columns.get(i);
            float overlap = Math.min(x2, c[1]) - Math.max(x1, c[0]);
            if (overlap > SPAN_SLACK_PT) hits.add(i);
        }
        if (hits.isEmpty()) hits.add(columnOf(x1, x2));
        int[] out = new int[hits.size()];
        for (int i = 0; i < hits.size(); i++) out[i] = hits.get(i);
        return out;
    }
}
