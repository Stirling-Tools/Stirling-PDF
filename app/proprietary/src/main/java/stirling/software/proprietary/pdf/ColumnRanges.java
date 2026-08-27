package stirling.software.proprietary.pdf;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import stirling.software.jpdfium.text.TextLine;
import stirling.software.jpdfium.text.TextWord;

/**
 * Finds a table's column x-ranges by vertical-whitespace projection: each row contributes coverage
 * for the x-bands its words occupy, a column is a contiguous band covered by enough rows, and the
 * gaps between such bands are the gutters.
 *
 * <p>Bands separated by only a narrow gutter are merged afterwards. A real column separator is
 * several characters wide, where the gaps inside a multi-word cell are about one; without the
 * merge, a cell like {@code January 20th, 2026} whose words align across every row would come out
 * as three spurious columns.
 */
final class ColumnRanges {

    private ColumnRanges() {}

    /** Character widths of clear space that separate two columns of an unruled block. */
    static final float GUTTER_CHARS = 2.5f;

    /** Absolute floor, in points, on an unruled block's column gutter. */
    static final float GUTTER_FLOOR = 10f;

    /** As {@link #GUTTER_CHARS}, for a block the page's rules already declare to be a table. */
    static final float RULED_GUTTER_CHARS = 1.2f;

    /** As {@link #GUTTER_FLOOR}, for a block the page's rules already declare to be a table. */
    static final float RULED_GUTTER_FLOOR = 4f;

    static List<float[]> find(List<Line> rows) {
        return find(rows, GUTTER_CHARS, GUTTER_FLOOR);
    }

    /**
     * Finds column x-ranges by vertical-whitespace projection. Each row contributes coverage for
     * the x-bands its words occupy; a column is a contiguous band covered by a sufficient fraction
     * of rows, and the gaps between such bands are the gutters.
     */
    static List<float[]> find(List<Line> rows, float gutterChars, float gutterFloor) {
        return find(rows, gutterChars, gutterFloor, 0);
    }

    /**
     * As above, but {@code minSupport} overrides how many rows must occupy an x-band for it to be a
     * column. Zero keeps the default, which scales with the row count.
     */
    static List<float[]> find(
            List<Line> rows, float gutterChars, float gutterFloor, int minSupport) {
        float minX = Float.MAX_VALUE;
        float maxX = -Float.MAX_VALUE;
        for (Line l : rows) {
            for (TextWord w : l.words()) {
                minX = Math.min(minX, w.x());
                maxX = Math.max(maxX, w.x() + w.width());
            }
        }
        // Real pages are under ~2000pt wide; anything larger is a malformed/crafted coordinate
        // that would allocate a multi-GB array or produce a negative span on overflow.
        if (maxX <= minX || (maxX - minX) > 2000f) {
            return List.of();
        }

        int lo = (int) Math.floor(minX);
        int span = Math.min((int) Math.ceil(maxX) - lo + 1, 2001);
        int[] coverage = new int[span];
        for (Line l : rows) {
            boolean[] covered = new boolean[span];
            for (TextWord w : l.words()) {
                int a = Math.max(0, (int) Math.floor(w.x()) - lo);
                int b = Math.min(span, (int) Math.ceil(w.x() + w.width()) - lo);
                for (int x = a; x < b; x++) {
                    covered[x] = true;
                }
            }
            for (int x = 0; x < span; x++) {
                if (covered[x]) {
                    coverage[x]++;
                }
            }
        }

        // A column band must be occupied by at least this many rows; below it is gutter.
        int support = minSupport > 0 ? minSupport : Math.max(2, Math.round(rows.size() * 0.35f));
        List<float[]> columns = new ArrayList<>();
        int start = -1;
        for (int x = 0; x < span; x++) {
            boolean isColumn = coverage[x] >= support;
            if (isColumn && start < 0) {
                start = x;
            } else if (!isColumn && start >= 0) {
                columns.add(new float[] {lo + start, lo + x});
                start = -1;
            }
        }
        if (start >= 0) {
            columns.add(new float[] {(float) (lo + start), (float) (lo + span)});
        }

        // Merge bands separated by only a narrow gutter. A real column separator is several
        // characters wide; the gaps *inside* a multi-word cell (ordinary word spacing) are about
        // one character. Without this, a cell like "January 20th, 2026" — whose words align
        // vertically across every row — would be split into three spurious columns.
        float charWidth = WordGeometry.averageCharWidth(rows);
        float minGutter = Math.max(gutterFloor, charWidth * gutterChars);
        List<float[]> merged = new ArrayList<>();
        for (float[] band : columns) {
            if (!merged.isEmpty() && band[0] - merged.getLast()[1] < minGutter) {
                merged.getLast()[1] = band[1];
            } else {
                merged.add(new float[] {band[0], band[1]});
            }
        }
        return merged;
    }

    /**
     * Visible for testing: column detection depends only on word geometry, so tests can drive it
     * from synthetic {@link TextLine}s to exercise degenerate-coordinate handling (the crash path
     * an extreme text matrix can produce) without needing a binary PDF fixture.
     */
    static List<float[]> fromTextLines(List<TextLine> rows) {
        return find(rows.stream().map(Line::new).collect(Collectors.toList()));
    }
}
