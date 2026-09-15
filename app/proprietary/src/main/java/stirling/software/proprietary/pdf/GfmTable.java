package stirling.software.proprietary.pdf;

import java.util.List;

/** Renders a resolved cell grid as a GitHub-Flavored Markdown table. */
final class GfmTable {

    private GfmTable() {}

    static String render(List<String[]> rows, int cols) {
        if (rows.isEmpty()) {
            return "";
        }
        int[] widths = new int[cols];
        for (int c = 0; c < cols; c++) {
            widths[c] = 3;
        }
        for (String[] row : rows) {
            for (int c = 0; c < cols; c++) {
                if (c < row.length) {
                    widths[c] = Math.max(widths[c], escapeCell(row[c]).length());
                }
            }
        }
        StringBuilder sb = new StringBuilder();
        sb.append(buildGfmRow(rows.getFirst(), widths, cols)).append('\n');
        sb.append('|');
        for (int c = 0; c < cols; c++) {
            sb.append('-').append("-".repeat(widths[c])).append('-').append('|');
        }
        for (int r = 1; r < rows.size(); r++) {
            sb.append('\n').append(buildGfmRow(rows.get(r), widths, cols));
        }
        return sb.toString();
    }

    private static String buildGfmRow(String[] row, int[] widths, int cols) {
        StringBuilder sb = new StringBuilder().append('|');
        for (int c = 0; c < cols; c++) {
            String cell = c < row.length ? escapeCell(row[c]) : "";
            sb.append(' ').append(padRight(cell, widths[c])).append(' ').append('|');
        }
        return sb.toString();
    }

    private static String escapeCell(String cell) {
        // Cell content is inline context: escape inline markdown (including the column delimiter)
        // but not leading block markers, which have no meaning inside a table cell.
        return MarkdownText.escapeMarkdownInline(cell);
    }

    private static String padRight(String s, int width) {
        return s.length() >= width ? s : s + " ".repeat(width - s.length());
    }
}
