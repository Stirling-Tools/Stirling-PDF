package stirling.software.proprietary.pdf;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

import stirling.software.jpdfium.text.TextWord;

/**
 * Resolves a detected table block into a cell grid, and renders it.
 *
 * <p>Columns come from vertical-whitespace projection across all of the block's lines rather than a
 * gap threshold on pooled word x's, which is fragile when numbers are right-aligned or sparse cells
 * sit in their own band. Where the page drew its own column rules those are used instead, being
 * exact where projection only guesses.
 *
 * <p>The false-positive guards live here too, so Markdown rendering and any other consumer see
 * exactly the same cells and the same verdict on whether the block is a table at all.
 */
final class TableGrid {

    private TableGrid() {}

    /**
     * Renders a table block. {@code ruledColumns} are exact column bands read from vertical ruling
     * lines; when null the columns are derived by whitespace projection instead.
     */
    static String render(
            List<List<Line>> rowGroups, List<float[]> ruledColumns, RowSource rowSource) {
        List<String[]> rows = cells(rowGroups, ruledColumns, rowSource);
        return rows.isEmpty() ? "" : GfmTable.render(rows, rows.get(0).length);
    }

    /**
     * Resolves a table block into a cell grid, or empty when it fails the false-positive guards.
     */
    static List<String[]> cells(
            List<List<Line>> rowGroups, List<float[]> ruledColumns, RowSource rowSource) {
        // Detect columns by vertical-whitespace projection across all lines, rather than a 1-D gap
        // threshold on pooled word x's. Pooled-gap detection is fragile when numbers are
        // right-aligned (a 10-digit value starts well left of a 7-digit one) or when sparse cells
        // sit in their own x-band. Projection asks "which x-bands are occupied across many rows",
        // which is stable under those conditions.
        List<Line> flat = rowGroups.stream().flatMap(List::stream).collect(Collectors.toList());
        // Inside a region the rules already declare a table, a narrower gutter still separates
        // columns: the wide floor only exists to stop word spacing splitting an unruled block.
        List<float[]> columns =
                ruledColumns != null
                        ? ruledColumns
                        : ColumnRanges.find(
                                flat,
                                rowSource.ruleConfirmed()
                                        ? ColumnRanges.RULED_GUTTER_CHARS
                                        : ColumnRanges.GUTTER_CHARS,
                                rowSource.ruleConfirmed()
                                        ? ColumnRanges.RULED_GUTTER_FLOOR
                                        : ColumnRanges.GUTTER_FLOOR);
        // A column only the header occupies is invisible to the projection, which needs a band
        // shared by several rows; but inside a ruled region a blank answer column is still one.
        boolean headerOnlyColumn = false;
        if (columns.size() < 2 && ruledColumns == null && rowSource.ruleConfirmed()) {
            List<float[]> retry =
                    ColumnRanges.find(
                            flat,
                            ColumnRanges.RULED_GUTTER_CHARS,
                            ColumnRanges.RULED_GUTTER_FLOOR,
                            1);
            // Only the worksheet shape: exactly one row, the first, reaches past the supported
            // column. Anything else would invent a column and swallow the headings around it.
            if (retry.size() >= 2 && retry.size() <= 15) {
                float edge = retry.get(0)[1];
                int beyond = 0;
                int firstBeyond = -1;
                for (int r = 0; r < rowGroups.size(); r++) {
                    boolean out = false;
                    for (Line l : rowGroups.get(r)) {
                        for (TextWord w : l.words()) {
                            if (!w.text().strip().isEmpty() && w.x() + w.width() / 2f > edge) {
                                out = true;
                            }
                        }
                    }
                    if (out) {
                        beyond++;
                        if (firstBeyond < 0) {
                            firstBeyond = r;
                        }
                    }
                }
                if (beyond == 1 && firstBeyond == 0 && rowGroups.size() >= 3) {
                    columns = retry;
                    headerOnlyColumn = true;
                }
            }
        }
        // Only a drawn lattice can be a one-column table; inferred from whitespace it is just a
        // run of centred lines.
        int minColumns = rowSource == RowSource.LATTICE ? 1 : 2;
        if (columns.size() < minColumns || columns.size() > 15) {
            return List.of();
        }

        float[] centers = new float[columns.size()];
        for (int i = 0; i < columns.size(); i++) {
            centers[i] = (columns.get(i)[0] + columns.get(i)[1]) / 2f;
        }

        int cols = centers.length;
        List<String[]> rows = new ArrayList<>();
        for (List<Line> rowLines : rowGroups) {
            String[] row = new String[cols];
            TextWord[] lastWord = new TextWord[cols];
            String[] lastText = new String[cols];
            boolean[] boundMark = new boolean[cols];
            for (int i = 0; i < cols; i++) {
                row[i] = "";
                lastText[i] = "";
            }
            // Top line first so a wrapped cell's words stay in reading order within the cell.
            rowLines.sort(Comparator.comparingDouble((Line l) -> l.y).reversed());
            for (Line line : rowLines) {
                for (TextWord word : line.words()) {
                    String wt = word.text().strip();
                    if (wt.isEmpty()) {
                        continue;
                    }
                    float mid = word.x() + word.width() / 2f;
                    // Ruled columns are real boundaries, so a word belongs to the band that
                    // contains it; projected columns are only approximate centres, so nearest wins.
                    int col =
                            ruledColumns != null
                                    ? containingColumn(mid, columns)
                                    : nearestColumn(mid, centers);
                    // A mark that closed up against the word on its left closes up against the
                    // word on its right too, so Party - List does not settle at "Party- List".
                    boolean bind =
                            !row[col].isEmpty()
                                    && (boundMark[col]
                                            || (WordGeometry.isBindingMark(wt)
                                                            || WordGeometry.isBindingMark(
                                                                    lastText[col]))
                                                    && !WordGeometry.separated(
                                                            lastWord[col], word));
                    row[col] = row[col].isEmpty() ? wt : row[col] + (bind ? "" : " ") + wt;
                    boundMark[col] = bind && WordGeometry.isBindingMark(wt);
                    lastWord[col] = word;
                    lastText[col] = wt;
                }
            }
            for (int c = 0; c < cols; c++) {
                row[c] = WordGeometry.rejoinContractions(row[c]);
            }
            rows.add(row);
        }

        // Guard against false positives while tolerating uneven rows (sparse cells, merged/spanning
        // headers). The columns already come from cross-row whitespace alignment, so a stable grid
        // exists. Additionally require: at least one "anchor" row that nearly fills the grid (so
        // the
        // column count is real, not an artefact), and that most rows are genuinely multi-column.
        if (ruledColumns != null) {
            // A rule that is not a column separator (a cell outline, a shading edge) leaves an
            // empty column; drop those rather than emitting them across every row.
            List<Integer> keep = new ArrayList<>();
            for (int c = 0; c < cols; c++) {
                final int col = c;
                if (rows.stream().anyMatch(r -> !r[col].isEmpty())) {
                    keep.add(c);
                }
            }
            // Two is the floor whatever the rows say: one filled column means the rules drew a box
            // round a single block of text, not a table.
            if (keep.size() < 2) {
                return List.of();
            }
            if (keep.size() < cols) {
                List<String[]> trimmed = new ArrayList<>(rows.size());
                for (String[] r : rows) {
                    String[] t = new String[keep.size()];
                    for (int i = 0; i < keep.size(); i++) {
                        t[i] = r[keep.get(i)];
                    }
                    trimmed.add(t);
                }
                rows = trimmed;
                cols = keep.size();
                List<float[]> kept = new ArrayList<>(keep.size());
                for (int idx : keep) {
                    kept.add(columns.get(idx));
                }
                columns = kept;
            }
        }

        if (cols == 1) {
            // A one-column table has no cross-row alignment to check, so the evidence is the rules
            // plus the shape of the run: enough rows, nearly all carrying text.
            long filled = rows.stream().filter(r -> !r[0].isEmpty()).count();
            return rows.size() >= SINGLE_COLUMN_ROWS && filled >= rows.size() * SINGLE_COLUMN_FILLED
                    ? rows
                    : List.of();
        }

        int anchorWidth = Math.max(2, Math.round(cols * 0.6f));
        long anchorRows = rows.stream().filter(r -> filledCells(r) >= anchorWidth).count();
        long multiColumnRows = rows.stream().filter(r -> filledCells(r) >= 2).count();
        // The multi-column tests ask whether a grid inferred from whitespace is real; when rows
        // and columns are both drawn there is nothing to infer, and a blank worksheet would fail.
        boolean drawnGrid =
                headerOnlyColumn || (ruledColumns != null && rowSource == RowSource.LATTICE);
        if (drawnGrid
                ? anchorRows < 1
                : (anchorRows < 1 || multiColumnRows < 2 || multiColumnRows < rows.size() * 0.5)) {
            return List.of();
        }
        if (ruledColumns == null && TableShape.isProseNotTable(rows, cols)) {
            return List.of();
        }
        return rows;
    }

    /** Rows a single-column ruled table needs before it is a table rather than a run of lines. */
    private static final int SINGLE_COLUMN_ROWS = 3;

    /** Fraction of a single-column table's rows that must carry text. */
    private static final float SINGLE_COLUMN_FILLED = 0.8f;

    /** Index of the column band containing x, clamped to the first/last band outside the grid. */
    static int containingColumn(float x, List<float[]> columns) {
        for (int i = 0; i < columns.size(); i++) {
            if (x < columns.get(i)[1]) {
                return i;
            }
        }
        return columns.size() - 1;
    }

    private static int nearestColumn(float x, float[] centers) {
        int best = 0;
        float bestDist = Float.MAX_VALUE;
        for (int i = 0; i < centers.length; i++) {
            float d = Math.abs(x - centers[i]);
            if (d < bestDist) {
                bestDist = d;
                best = i;
            }
        }
        return best;
    }

    static int filledCells(String[] row) {
        int count = 0;
        for (String cell : row) {
            if (!cell.isEmpty()) {
                count++;
            }
        }
        return count;
    }
}
