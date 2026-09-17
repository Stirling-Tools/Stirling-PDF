package stirling.software.proprietary.pdf;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import stirling.software.jpdfium.text.TextWord;

/**
 * Groups the lines inside a ruled region into rows, and reads its column bands off the vertical
 * rules.
 */
final class RuledRows {

    private RuledRows() {}

    /** A vertical rule must cover this fraction of a region's height to be a column boundary. */
    private static final float COLUMN_COVERAGE = 0.5f;

    /**
     * Splits a band whose every baseline is a complete row back into those rows; a wrapped cell
     * leaves the other columns empty, a run of rows does not.
     */
    static List<List<Line>> splitCompleteBands(List<List<Line>> bands, List<float[]> cols) {
        if (cols == null || cols.size() < 2) {
            return bands;
        }
        List<List<Line>> out = new ArrayList<>();
        for (List<Line> band : bands) {
            List<List<Line>> baselines = baselineRows(band);
            if (baselines.size() < 2 || !allRowsComplete(baselines, cols)) {
                out.add(band);
                continue;
            }
            out.addAll(baselines);
        }
        return out;
    }

    /** True when every baseline group puts a word in every column band. */
    private static boolean allRowsComplete(List<List<Line>> baselines, List<float[]> cols) {
        for (List<Line> row : baselines) {
            boolean[] hit = new boolean[cols.size()];
            for (Line l : row) {
                for (TextWord w : l.words()) {
                    if (w.text().strip().isEmpty()) {
                        continue;
                    }
                    int c = TableGrid.containingColumn(w.x() + w.width() / 2f, cols);
                    if (c >= 0 && c < hit.length) {
                        hit[c] = true;
                    }
                }
            }
            for (boolean h : hit) {
                if (!h) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Column bands from the vertical rules spanning the region; null when no interior rule
     * survives, as whitespace projection guesses better.
     */
    static List<float[]> columns(
            List<RuleGrid.Level> vLevels, float left, float right, float top, float bottom) {
        float height = top - bottom;
        // Per-cell strokes give one rule per row, and a row that draws no boxes breaks the run
        // in two, so strokes at one x are measured together rather than as separate runs.
        List<RuleGrid.Level> sorted = new ArrayList<>(vLevels);
        sorted.sort(Comparator.comparingDouble(RuleGrid.Level::pos));
        List<Float> xs = new ArrayList<>();
        int at = 0;
        while (at < sorted.size()) {
            float pos = sorted.get(at).pos();
            float covered = 0f;
            int end = at;
            while (end < sorted.size() && sorted.get(end).pos() - pos <= RuleGrid.LEVEL_TOLERANCE) {
                RuleGrid.Level v = sorted.get(end);
                covered += Math.max(0f, Math.min(top, v.hi()) - Math.max(bottom, v.lo()));
                end++;
            }
            if (covered >= height * COLUMN_COVERAGE) {
                xs.add(pos);
            }
            at = end;
        }
        List<Float> bounds = new ArrayList<>();
        bounds.add(left);
        for (float x : xs) {
            if (x > bounds.get(bounds.size() - 1) + RuleGrid.LEVEL_TOLERANCE
                    && x < right - RuleGrid.LEVEL_TOLERANCE) {
                bounds.add(x);
            }
        }
        if (bounds.size() < 2) {
            return null;
        }
        bounds.add(right);
        List<float[]> cols = new ArrayList<>();
        for (int i = 1; i < bounds.size(); i++) {
            cols.add(new float[] {bounds.get(i - 1), bounds.get(i)});
        }
        return cols;
    }

    /** Rows delimited by horizontal rules; this is what keeps a wrapped cell as one row. */
    static List<List<Line>> latticeRows(List<Float> bands, List<Line> inside) {
        List<List<Line>> rows = new ArrayList<>();
        for (int i = 1; i < bands.size(); i++) {
            float hi = bands.get(i - 1);
            float lo = bands.get(i);
            List<Line> band = new ArrayList<>();
            for (Line l : inside) {
                float cy = l.y + l.height / 2f;
                if (cy > lo && cy <= hi) {
                    band.add(l);
                }
            }
            if (!band.isEmpty()) {
                rows.add(band);
            }
        }
        return rows;
    }

    /** Rows by baseline proximity, for a table ruled between its columns but not its rows. */
    static List<List<Line>> baselineRows(List<Line> inside) {
        List<Line> sorted = new ArrayList<>(inside);
        sorted.sort(Comparator.comparingDouble((Line l) -> l.y).reversed());
        List<Float> heights = sorted.stream().map(l -> l.height).sorted().toList();
        float sameRow = Math.max(2f, heights.get(heights.size() / 2) * 0.6f);
        List<List<Line>> rows = new ArrayList<>();
        List<Line> current = new ArrayList<>();
        float anchor = 0f;
        for (Line l : sorted) {
            if (current.isEmpty()) {
                anchor = l.y;
            } else if (anchor - l.y > sameRow) {
                rows.add(current);
                current = new ArrayList<>();
                anchor = l.y;
            }
            current.add(l);
        }
        if (!current.isEmpty()) {
            rows.add(current);
        }
        return rows;
    }
}
