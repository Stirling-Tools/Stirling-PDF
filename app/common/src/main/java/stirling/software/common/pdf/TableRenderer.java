package stirling.software.common.pdf;

import stirling.software.jpdfium.text.Table;

final class TableRenderer {
    private TableRenderer() {}

    /** Renders a Table as a GitHub-Flavoured Markdown table string. */
    static String render(Table table) {
        if (table.rowCount() == 0) {
            return "";
        }

        String[][] grid = table.asGrid();

        if (table.rowCount() < 2) {
            // No separator row possible — return plain lines
            StringBuilder sb = new StringBuilder();
            for (int c = 0; c < grid[0].length; c++) {
                if (c > 0) sb.append('\n');
                sb.append(escape(grid[0][c].trim()));
            }
            return sb.toString();
        }

        int cols = grid[0].length;

        // Compute column widths: max(3, max content length across all rows)
        int[] widths = new int[cols];
        for (int c = 0; c < cols; c++) {
            widths[c] = 3;
        }
        for (String[] row : grid) {
            for (int c = 0; c < cols; c++) {
                String cell = c < row.length ? row[c].trim() : "";
                widths[c] = Math.max(widths[c], escape(cell).length());
            }
        }

        StringBuilder sb = new StringBuilder();

        // Header row
        sb.append(buildRow(grid[0], widths, cols));
        sb.append('\n');

        // Separator row
        sb.append('|');
        for (int c = 0; c < cols; c++) {
            sb.append('-').append("-".repeat(widths[c])).append('-').append('|');
        }
        sb.append('\n');

        // Data rows
        for (int r = 1; r < grid.length; r++) {
            sb.append(buildRow(grid[r], widths, cols));
            if (r < grid.length - 1) {
                sb.append('\n');
            }
        }

        return sb.toString();
    }

    private static String buildRow(String[] row, int[] widths, int cols) {
        StringBuilder sb = new StringBuilder();
        sb.append('|');
        for (int c = 0; c < cols; c++) {
            String cell = c < row.length ? escape(row[c].trim()) : "";
            sb.append(' ').append(padRight(cell, widths[c])).append(' ').append('|');
        }
        return sb.toString();
    }

    private static String escape(String cell) {
        return cell.replace("|", "\\|");
    }

    private static String padRight(String s, int width) {
        if (s.length() >= width) return s;
        return s + " ".repeat(width - s.length());
    }
}
