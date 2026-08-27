package stirling.software.proprietary.pdf;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * False-positive guards: whether a block the detectors found is really a table, and whether it is
 * wide enough to outrank the page's own column layout.
 *
 * <p>Running text aligns across rows exactly as cells do, so geometry alone cannot separate the
 * two. These tests read the resolved cells instead - how long they are, whether any column keys the
 * rows, and whether neighbouring cells continue each other's sentences.
 */
final class TableShape {

    private TableShape() {}

    /** Fraction of the page's text width a table must span to override two-column layout. */
    private static final float FULL_WIDTH = 0.6f;

    /** Rows of a two-column block that must end in a page number for it to be a contents list. */
    private static final float TOC_ROWS = 0.65f;

    /** Mean filled-cell length above which a two-column block reads as prose, not cells. */
    private static final float PROSE_CELL = 40f;

    private static final Pattern PAGE_NUMBER = Pattern.compile("[0-9]{1,4}|[ivxlcdmIVXLCDM]{1,7}");

    /** A run of spaced or solid dots, the leader of a contents line. */
    private static final Pattern DOT_LEADER = Pattern.compile("(\\.\\s*){4,}|…");

    /**
     * True when a block is running text the word grid mistook for a table: a contents list, with or
     * without dot leaders, or two columns of prose whose "cells" are whole sentences.
     */
    static boolean isProseNotTable(List<String[]> rows, int cols) {
        if (rows.isEmpty()) {
            return false;
        }
        for (String[] row : rows) {
            for (String cell : row) {
                if (DOT_LEADER.matcher(cell).find()) {
                    return true;
                }
            }
        }
        if (cols != 2) {
            return everyColumnIsProse(rows, cols);
        }
        int folios = 0;
        int length = 0;
        int filled = 0;
        for (String[] row : rows) {
            String last = "";
            for (String cell : row) {
                if (!cell.isEmpty()) {
                    length += cell.length();
                    filled++;
                    last = cell;
                }
            }
            if (PAGE_NUMBER.matcher(last).matches() && !PAGE_NUMBER.matcher(row[0]).matches()) {
                folios++;
            }
        }
        if (folios >= rows.size() * TOC_ROWS) {
            return true;
        }
        return filled > 0 && (float) length / filled >= PROSE_CELL;
    }

    /** Mean cell length at or above which a column carries sentences rather than values. */
    private static final float PROSE_COLUMN = 20f;

    /** Fraction of neighbouring cells that must continue each other's sentence to read as prose. */
    private static final float PROSE_RUN_ON = 0.5f;

    /** A cell that ends a sentence or clause, so the cell after it starts something new. */
    private static final Pattern CELL_ENDS_CLAUSE = Pattern.compile("[.!?:;,]$");

    /**
     * True when a wider block is a multi-column page layout the word grid read across rather than a
     * table. Two things have to hold at once, because either alone has honest counter-examples.
     *
     * <p>No column keys the rows. Every real wide table keeps one column of short values to
     * identify its rows by - a name, a code, a yes/no - however long its other columns run.
     *
     * <p>And the cells continue each other. Text set in columns puts one sentence across several
     * cells, so a cell ends mid-clause and its neighbour opens in lower case; a table's cells are
     * independent values and do not run on.
     */
    static boolean everyColumnIsProse(List<String[]> rows, int cols) {
        if (cols < 3) {
            return false;
        }
        for (int c = 0; c < cols; c++) {
            int length = 0;
            int filled = 0;
            for (String[] row : rows) {
                if (c < row.length && !row[c].isEmpty()) {
                    length += row[c].length();
                    filled++;
                }
            }
            if (filled == 0 || (float) length / filled < PROSE_COLUMN) {
                return false;
            }
        }
        return runsOnAcrossCells(rows);
    }

    /**
     * Fraction of side-by-side filled cells where the right one continues the left one's clause.
     */
    private static boolean runsOnAcrossCells(List<String[]> rows) {
        int pairs = 0;
        int runOn = 0;
        for (String[] row : rows) {
            String previous = null;
            for (String cell : row) {
                if (cell.isEmpty()) {
                    continue;
                }
                if (previous != null) {
                    pairs++;
                    if (!CELL_ENDS_CLAUSE.matcher(previous).find()
                            && Character.isLowerCase(cell.charAt(0))) {
                        runOn++;
                    }
                }
                previous = cell;
            }
        }
        return pairs > 0 && (float) runOn / pairs > PROSE_RUN_ON;
    }

    /**
     * True when no text outside the block sits in the block's vertical band. Such a block cannot be
     * one column's worth of a two-column layout, because there is nothing in the other column.
     */
    static boolean ownsItsBand(TableBlock block, List<Line> lines) {
        Set<Line> own = new HashSet<>();
        for (List<Line> row : block.rows()) {
            own.addAll(row);
        }
        for (Line l : lines) {
            if (own.contains(l)) {
                continue;
            }
            float centre = l.y + l.height / 2f;
            if (centre > block.bottom() && centre < block.top()) {
                return false;
            }
        }
        return true;
    }

    /** Columns a full-width unruled block needs before it can outrank the page's column layout. */
    private static final int GRID_COLUMNS = 3;

    /** Mean filled-cell length above which a full-width unruled block is prose read across. */
    private static final float GRID_CELL = 25f;

    /**
     * True when an unruled full-width block is really a table, not the page's own column gutter
     * read as a cell boundary: a data table's cells are short values, the gutter's are sentences.
     */
    static boolean looksLikeGrid(TableBlock block) {
        List<String[]> cells = block.cells();
        if (cells.isEmpty() || cells.get(0).length < GRID_COLUMNS) {
            return false;
        }
        int length = 0;
        int filled = 0;
        for (String[] row : cells) {
            for (String cell : row) {
                if (!cell.isEmpty()) {
                    length += cell.length();
                    filled++;
                }
            }
        }
        return filled > 0 && (float) length / filled <= GRID_CELL;
    }

    /** True when a table block is wide enough to be a full-width table, not one inside a column. */
    static boolean spansPage(TableBlock block, List<Line> lines) {
        float pageLo = Float.MAX_VALUE;
        float pageHi = -Float.MAX_VALUE;
        for (Line l : lines) {
            pageLo = Math.min(pageLo, l.x);
            pageHi = Math.max(pageHi, l.x + l.width);
        }
        float lo = Float.MAX_VALUE;
        float hi = -Float.MAX_VALUE;
        for (List<Line> row : block.rows()) {
            for (Line l : row) {
                lo = Math.min(lo, l.x);
                hi = Math.max(hi, l.x + l.width);
            }
        }
        return pageHi > pageLo && (hi - lo) >= (pageHi - pageLo) * FULL_WIDTH;
    }
}
