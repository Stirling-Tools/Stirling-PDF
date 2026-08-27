package stirling.software.proprietary.pdf;

import java.util.List;

/**
 * A detected table. Each row is a list of source lines: usually one, but more when a cell wraps
 * onto extra lines (those continuation lines are absorbed into the row they belong to).
 */
record TableBlock(
        List<List<Line>> rows,
        float top,
        float bottom,
        List<float[]> cols,
        boolean ruled,
        RowSource rowSource,
        int page) {
    TableBlock(List<List<Line>> rows, float top, float bottom, int page) {
        this(rows, top, bottom, null, false, RowSource.WORDS, page);
    }

    /** A rules-derived block whose rows are not a drawn lattice. */
    TableBlock(List<List<Line>> rows, float top, float bottom, List<float[]> cols, int page) {
        this(rows, top, bottom, cols, true, RowSource.RULE_BOUNDED, page);
    }

    String render() {
        return TableGrid.render(rows, cols, rowSource);
    }

    /** Cell grid for the layout guards; empty when the block fails the table guards. */
    List<String[]> cells() {
        return TableGrid.cells(rows, cols, rowSource);
    }
}
