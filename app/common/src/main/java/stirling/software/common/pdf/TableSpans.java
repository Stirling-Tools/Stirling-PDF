package stirling.software.common.pdf;

import java.util.ArrayList;
import java.util.List;

/**
 * Recovers merged cells from a flattened cell grid, and renders a table as HTML.
 *
 * <p>A GFM pipe table is rectangular, so a cell that spans several columns or rows survives
 * flattening only as a shape: its text lands in one band and the bands it also covers come out
 * empty. That shape alone is ambiguous - a genuinely empty cell leaves the same hole - so a merge
 * is only asserted where the page's own ruling lines say the boundary was never drawn.
 */
final class TableSpans {

    private TableSpans() {}

    /** A rule must leave at most this fraction of a band uncovered to count as drawn across it. */
    private static final float COVERAGE = 0.8f;

    /** Slack when matching a rule's position to a cell boundary. */
    private static final float POS_TOLERANCE = 4f;

    /** Slack at each end of a band when testing whether rules cover it. */
    private static final float BAND_SLACK = 1.5f;

    /** Ablation: restrict the banner-row merge to rows whose text starts at column 0. */
    private static final boolean BANNER_FROM_FIRST_COLUMN =
            Boolean.parseBoolean(System.getProperty("stirling.md.bannerFirstColumn", "true"));

    /**
     * Off by default. A row carrying a single cell of text looks like a spanning banner, and
     * merging it does score better here, but measured against the ground truth it fires on 11
     * tables that carry no merged cell at all and on only 2 that do: the shape it recognises is
     * usually a table this converter over-segmented, not a span the page drew.
     */
    private static final boolean BANNER_ROW =
            Boolean.parseBoolean(System.getProperty("stirling.md.bannerRow", "false"));

    /** One cell of a span-aware grid. {@code null} marks a position covered by another cell. */
    record Cell(String text, int colspan, int rowspan) {}

    /** Vertical extent of one rendered row, in PDF user space (y grows upwards). */
    record Band(float lo, float hi) {}

    /**
     * Infers merged cells. {@code columns} and {@code bands} are the x and y extents of the grid's
     * columns and rows; either may be null, in which case only the unambiguous whole-row merge is
     * applied.
     */
    static List<List<Cell>> infer(
            List<String[]> grid,
            List<float[]> columns,
            List<Band> bands,
            PageRules rules,
            boolean geometry) {
        int nr = grid.size();
        int nc = grid.get(0).length;
        boolean[][] covered = new boolean[nr][nc];
        int[][] cs = new int[nr][nc];
        int[][] rs = new int[nr][nc];
        for (int r = 0; r < nr; r++) {
            for (int c = 0; c < nc; c++) {
                cs[r][c] = 1;
                rs[r][c] = 1;
            }
        }

        boolean geo =
                geometry
                        && columns != null
                        && bands != null
                        && rules != null
                        && !rules.isEmpty()
                        && columns.size() == nc
                        && bands.size() == nr;

        if (geo) {
            // A merged cell is not "no rule here"; it is "the rule that separates this row from the
            // next stops short of this column". So a boundary must exist - be drawn across some
            // other column - before its absence at one column means anything. A table whose rows
            // are only whitespace-separated draws no boundary at all and merges nothing; a fully
            // ruled one draws every boundary everywhere and merges nothing either.
            boolean[][] hDrawn = new boolean[nr][nc];
            boolean[][] vDrawn = new boolean[nr][nc];
            boolean[] rowBoundary = new boolean[nr];
            boolean[] colBoundary = new boolean[nc];
            for (int r = 1; r < nr; r++) {
                for (int c = 0; c < nc; c++) {
                    hDrawn[r][c] =
                            hSeparated(rules, bands.get(r - 1), bands.get(r), columns.get(c));
                    rowBoundary[r] |= hDrawn[r][c];
                }
            }
            for (int c = 1; c < nc; c++) {
                for (int r = 0; r < nr; r++) {
                    vDrawn[r][c] =
                            vSeparated(rules, columns.get(c - 1), columns.get(c), bands.get(r));
                    colBoundary[c] |= vDrawn[r][c];
                }
            }

            // Row merges first: a column's cell continues downwards while the row rule below it
            // stops short of that column. Doing this before column merges keeps a cell that spans
            // both axes anchored on the row it starts in.
            for (int c = 0; c < nc; c++) {
                int r = 0;
                while (r < nr) {
                    if (text(grid, r, c).isEmpty()) {
                        r++;
                        continue;
                    }
                    int top = r;
                    int next = r + 1;
                    while (next < nr
                            && text(grid, next, c).isEmpty()
                            && rowBoundary[next]
                            && !hDrawn[next][c]
                            && rowHasContent(grid, next, c)) {
                        covered[next][c] = true;
                        rs[top][c]++;
                        next++;
                    }
                    r = Math.max(next, r + 1);
                }
            }
            for (int r = 0; r < nr; r++) {
                for (int c = 0; c < nc; c++) {
                    if (covered[r][c] || text(grid, r, c).isEmpty()) {
                        continue;
                    }
                    int next = c + 1;
                    while (next < nc
                            && !covered[r][next]
                            && text(grid, r, next).isEmpty()
                            && rs[r][next] == 1
                            && colBoundary[next]
                            && !vDrawn[r][next]) {
                        covered[r][next] = true;
                        cs[r][c]++;
                        next++;
                    }
                }
            }
        }

        // A row carrying exactly one cell of text is a banner: a section label, a caption row or a
        // spanning header. Its emptiness is not a hole in the data, it is the merge itself, and no
        // ruling line is needed to see that.
        for (int r = 0; BANNER_ROW && r < nr; r++) {
            int filled = -1;
            int count = 0;
            for (int c = 0; c < nc; c++) {
                if (covered[r][c]) {
                    continue;
                }
                if (!text(grid, r, c).isEmpty()) {
                    count++;
                    filled = c;
                } else if (rs[r][c] > 1) {
                    count = 2;
                    break;
                }
            }
            if (count != 1 || nc < 2 || rs[r][filled] != 1) {
                continue;
            }
            // Only a row whose text starts at the first column. A row that is blank on the left and
            // filled further right is the other common shape - a header whose corner cell is empty
            // above the row labels - and merging that one invents a span the page never drew.
            if (BANNER_FROM_FIRST_COLUMN && filled != 0) {
                continue;
            }
            int span = 0;
            for (int c = 0; c < nc; c++) {
                if (!covered[r][c] || c == filled) {
                    span++;
                }
            }
            if (span < 2) {
                continue;
            }
            cs[r][filled] = span;
            for (int c = 0; c < nc; c++) {
                if (c != filled && !covered[r][c]) {
                    covered[r][c] = true;
                }
            }
        }

        List<List<Cell>> out = new ArrayList<>(nr);
        for (int r = 0; r < nr; r++) {
            List<Cell> row = new ArrayList<>();
            for (int c = 0; c < nc; c++) {
                if (covered[r][c]) {
                    continue;
                }
                row.add(new Cell(text(grid, r, c), cs[r][c], rs[r][c]));
            }
            out.add(row);
        }
        return out;
    }

    private static String text(List<String[]> grid, int r, int c) {
        String[] row = grid.get(r);
        return c < row.length && row[c] != null ? row[c].trim() : "";
    }

    /** True when the row carries text in some column other than {@code skip}. */
    private static boolean rowHasContent(List<String[]> grid, int r, int skip) {
        String[] row = grid.get(r);
        for (int c = 0; c < row.length; c++) {
            if (c != skip && row[c] != null && !row[c].isBlank()) {
                return true;
            }
        }
        return false;
    }

    /** True when a horizontal rule is drawn between two row bands across a column's width. */
    private static boolean hSeparated(PageRules rules, Band upper, Band lower, float[] column) {
        float boundary = (lower.hi() + upper.lo()) / 2f;
        return covers(rules.horizontal(), boundary, column[0], column[1]);
    }

    /** True when a vertical rule is drawn between two columns across a row band's height. */
    private static boolean vSeparated(PageRules rules, float[] left, float[] right, Band band) {
        float boundary = (left[1] + right[0]) / 2f;
        return covers(rules.vertical(), boundary, band.lo(), band.hi());
    }

    /**
     * True when rules at {@code pos} cover the interval {@code lo..hi}. Segments are merged first:
     * a grid drawn as per-cell strokes lays one segment per cell along a boundary and no single one
     * of them covers a whole band.
     */
    private static boolean covers(List<PageRules.Rule> rules, float pos, float lo, float hi) {
        float span = hi - lo;
        if (span <= 0) {
            return false;
        }
        List<float[]> segments = new ArrayList<>();
        // Half the tolerance either side of pos: a boundary sits midway between two bands, so a
        // wider window would also catch the rules that bound the neighbouring band.
        for (PageRules.Rule r : rules) {
            if (Math.abs(r.pos() - pos) <= POS_TOLERANCE
                    && r.hi() >= lo - BAND_SLACK
                    && r.lo() <= hi + BAND_SLACK) {
                segments.add(new float[] {Math.max(r.lo(), lo), Math.min(r.hi(), hi)});
            }
        }
        if (segments.isEmpty()) {
            return false;
        }
        segments.sort((a, b) -> Float.compare(a[0], b[0]));
        float covered = 0f;
        float cur = segments.get(0)[0];
        float end = segments.get(0)[1];
        for (int i = 1; i < segments.size(); i++) {
            float[] s = segments.get(i);
            if (s[0] > end) {
                covered += end - cur;
                cur = s[0];
                end = s[1];
            } else {
                end = Math.max(end, s[1]);
            }
        }
        covered += end - cur;
        return covered >= span * COVERAGE;
    }

    /** True when any cell of the grid is merged. */
    static boolean hasSpans(List<List<Cell>> grid) {
        for (List<Cell> row : grid) {
            for (Cell c : row) {
                if (c.colspan() > 1 || c.rowspan() > 1) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Renders as an HTML table. The layout matches the serialisation the corpus and most HTML
     * writers use - one tag per line, two-space cell indent - so the markup reads as a table when a
     * human opens the file.
     */
    static String renderHtml(List<List<Cell>> grid) {
        StringBuilder sb = new StringBuilder("<table>");
        for (List<Cell> row : grid) {
            sb.append("\n <tr>");
            for (Cell c : row) {
                sb.append("\n  <td");
                if (c.colspan() > 1) {
                    sb.append(" colspan=\"").append(c.colspan()).append('"');
                }
                if (c.rowspan() > 1) {
                    sb.append(" rowspan=\"").append(c.rowspan()).append('"');
                }
                sb.append('>');
                sb.append("\n   ").append(escapeHtml(c.text()));
                sb.append("\n  </td>");
            }
            sb.append("\n </tr>");
        }
        return sb.append("\n</table>").toString();
    }

    private static String escapeHtml(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '&' -> sb.append("&amp;");
                case '<' -> sb.append("&lt;");
                case '>' -> sb.append("&gt;");
                default -> sb.append(ch);
            }
        }
        return sb.toString();
    }
}
