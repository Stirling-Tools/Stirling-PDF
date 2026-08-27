package stirling.software.proprietary.pdf;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import stirling.software.jpdfium.text.TextChar;
import stirling.software.jpdfium.text.TextWord;

/**
 * Rejoins extractor fragments that are really one visual line.
 *
 * <p>PDFium splits a line on its bounding box, so a run with no ascender ({@code rou}) lands apart
 * from the rest ({@code ghly ...}). Fragments are grouped into rows first and then joined left to
 * right, because a fragment's continuation is its right-hand neighbour on the same row, not
 * whichever line the extractor happened to emit next.
 */
final class LineMerger {

    private LineMerger() {}

    /** Gap above this many average character widths is a real layout gap, so never merged. */
    private static final float MAX_MERGE_GAP = 1.60f;

    /**
     * Rejoins extractor fragments that are really one visual line: PDFium splits on bounding box,
     * so a run with no ascender ({@code rou}) lands apart from the rest ({@code ghly ...}).
     */
    static List<Line> mergeLineFragments(List<Line> lines, List<Float> gutters) {
        if (lines.size() < 2) {
            return lines;
        }
        // Merge within each column, so a line ending at the gutter never joins the next column's.
        if (!gutters.isEmpty()) {
            List<List<Line>> columns = ColumnLayout.splitIntoColumns(lines, gutters);
            if (columns.size() > 1) {
                List<Line> out = new ArrayList<>(lines.size());
                for (List<Line> column : columns) {
                    out.addAll(mergeRows(column));
                }
                return out;
            }
        }
        return mergeRows(lines);
    }

    private static List<Line> mergeRows(List<Line> lines) {
        if (lines.size() < 2) {
            return new ArrayList<>(lines);
        }
        List<Line> ordered = new ArrayList<>(lines);
        // Top edge first, so fragments of one visual line arrive together whatever their heights.
        ordered.sort(Comparator.comparingDouble((Line l) -> -(l.y + l.height)));

        // Group into rows first: a fragment's continuation is its right-hand neighbour on the same
        // row, not whichever line the extractor happened to emit next.
        List<List<Line>> rows = new ArrayList<>();
        for (Line line : ordered) {
            List<Line> row = null;
            for (int i = rows.size() - 1; i >= 0 && i >= rows.size() - 3; i--) {
                if (overlapsRow(rows.get(i), line)) {
                    row = rows.get(i);
                    break;
                }
            }
            if (row == null) {
                row = new ArrayList<>();
                rows.add(row);
            }
            row.add(line);
        }

        List<Line> out = new ArrayList<>();
        for (List<Line> row : rows) {
            row.sort(Comparator.comparingDouble((Line l) -> l.x));
            Line host = null;
            for (Line line : row) {
                if (host != null && adjacentOnRow(host, line)) {
                    appendFragment(host, line);
                } else {
                    out.add(line);
                    host = line;
                }
            }
        }
        return out;
    }

    /** True when a line shares a row with the lines already in it (vertical overlap). */
    private static boolean overlapsRow(List<Line> row, Line line) {
        for (Line member : row) {
            float overlap =
                    Math.min(member.y + member.height, line.y + line.height)
                            - Math.max(member.y, line.y);
            float minHeight = Math.min(member.height, line.height);
            if (minHeight > 0f && overlap >= minHeight * 0.5f) {
                return true;
            }
        }
        return false;
    }

    /** True when {@code next} sits close enough to {@code host} to be the same visual line. */
    private static boolean adjacentOnRow(Line host, Line next) {
        // Merging concatenates left to right, which is reading order for LTR only; RTL fragments
        // would be joined back to front.
        if (hasStrongRtl(host.text) || hasStrongRtl(next.text)) {
            return false;
        }
        float gap = next.glyphLeft() - host.glyphRight();
        float charWidth = fragmentCharWidth(host, next);
        return gap > -charWidth && gap < charWidth * MAX_MERGE_GAP;
    }

    /** True when the text contains a Hebrew, Arabic, Syriac or Thaana character. */
    private static boolean hasStrongRtl(String text) {
        for (int i = 0; i < text.length(); i++) {
            byte dir = Character.getDirectionality(text.charAt(i));
            if (dir == Character.DIRECTIONALITY_RIGHT_TO_LEFT
                    || dir == Character.DIRECTIONALITY_RIGHT_TO_LEFT_ARABIC) {
                return true;
            }
        }
        return false;
    }

    private static void appendFragment(Line host, Line next) {
        float gap = next.glyphLeft() - host.glyphRight();
        float charWidth = fragmentCharWidth(host, next);
        String left = host.text.stripTrailing();
        String right = next.text.stripLeading();
        boolean space = gap >= charWidth * WordGeometry.NO_SPACE_GAP;
        host.text = left + (space ? " " : "") + right;
        host.merged.add(next.source);
        host.merged.addAll(next.merged);
        float right0 = Math.max(host.x + host.width, next.x + next.width);
        float top = Math.max(host.y + host.height, next.y + next.height);
        host.x = Math.min(host.x, next.x);
        host.y = Math.min(host.y, next.y);
        host.width = right0 - host.x;
        host.height = top - host.y;
    }

    private static float fragmentCharWidth(Line a, Line b) {
        double total = 0;
        int chars = 0;
        for (Line l : List.of(a, b)) {
            for (TextWord w : l.words()) {
                for (TextChar c : w.chars()) {
                    if (!c.isWhitespace() && !c.isNewline() && c.width() > 0f) {
                        total += c.width();
                        chars++;
                    }
                }
            }
        }
        return chars == 0 ? 6f : (float) (total / chars);
    }
}
