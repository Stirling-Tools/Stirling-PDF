package stirling.software.proprietary.pdf;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Joins what a page break split: a sentence running into the next page, and a table whose rows
 * continue on it.
 */
final class PageStitcher {

    private PageStitcher() {}

    static void mergeAcrossPageBoundary(List<Object> output, List<Object> pageItems) {
        if (output.isEmpty() || pageItems.isEmpty()) {
            return;
        }
        // Only merge a sentence continuation between two text paragraphs, never into/out of a
        // table.
        if (!(output.getLast() instanceof String last)
                || !(pageItems.getFirst() instanceof String first)) {
            return;
        }
        if (!first.isEmpty()
                && Character.isLowerCase(first.charAt(0))
                && !MarkdownText.endsWithSentencePunctuation(last)) {
            output.set(output.size() - 1, last + " " + first);
            pageItems.remove(0);
        }
    }

    /**
     * Joins tables split across a page break: two consecutive blocks with no text between them
     * merge when their column layouts match, dropping a repeated header.
     */
    static List<Object> stitchTables(List<Object> elements) {
        List<Object> out = new ArrayList<>();
        // Column geometry of the trailing TableBlock in `out`, carried forward across merges so a
        // table running page-to-page is not re-projected from every accumulated row at each break.
        ColumnAccumulator acc = null;
        // Row list we own and may append to in place; null while the trailing block still holds a
        // list belonging to `elements`.
        List<List<Line>> ownedRows = null;
        for (Object e : elements) {
            if (e instanceof TableBlock tb
                    && !out.isEmpty()
                    && out.getLast() instanceof TableBlock prev) {
                if (acc == null) {
                    acc = ColumnAccumulator.of(prev.rows());
                }
                if (columnsMatch(acc.columns(), ColumnRanges.find(flatten(tb.rows())))) {
                    List<List<Line>> merged;
                    if (ownedRows == null) {
                        merged = new ArrayList<>(prev.rows());
                        ownedRows = merged;
                    } else {
                        merged = ownedRows;
                    }
                    List<List<Line>> tail = tb.rows();
                    if (!tail.isEmpty()
                            && !prev.rows().isEmpty()
                            && rowText(tail.getFirst()).equals(rowText(prev.rows().getFirst()))) {
                        tail = tail.subList(1, tail.size());
                    }
                    for (List<Line> row : tail) {
                        for (Line l : row) {
                            acc.addLine(l);
                        }
                    }
                    merged.addAll(tail);
                    // A stitched table belongs to where it started, so keep the earlier block's
                    // page and columns; its ruling lines are dropped as they are one page's only.
                    out.set(
                            out.size() - 1,
                            new TableBlock(
                                    merged,
                                    prev.top(),
                                    tb.bottom(),
                                    prev.cols(),
                                    prev.ruled(),
                                    prev.rowSource(),
                                    prev.page()));
                    continue;
                }
            }
            out.add(e);
            acc = null;
            ownedRows = null;
        }
        return out;
    }

    private static List<Line> flatten(List<List<Line>> rows) {
        return rows.stream().flatMap(List::stream).collect(Collectors.toList());
    }

    /**
     * Header text of a table at the very bottom of a page, or null. Trailing image placeholders are
     * skipped; any other text means it is not a continuation.
     */
    static String trailingTableHeader(List<Object> pageItems) {
        for (int i = pageItems.size() - 1; i >= 0; i--) {
            Object e = pageItems.get(i);
            if (e instanceof String s && s.strip().startsWith("<image redacted")) {
                continue;
            }
            if (e instanceof TableBlock tb && !tb.rows().isEmpty()) {
                return rowText(tb.rows().getFirst());
            }
            return null;
        }
        return null;
    }

    static String rowText(List<Line> row) {
        List<Line> ordered = new ArrayList<>(row);
        ordered.sort(Comparator.comparingDouble((Line l) -> l.y).reversed());
        StringBuilder sb = new StringBuilder();
        for (Line l : ordered) {
            if (!sb.isEmpty()) {
                sb.append(' ');
            }
            sb.append(l.text);
        }
        return MarkdownText.normaliseSpace(sb.toString());
    }

    /** True when two table blocks have the same number of columns at near-identical x-centres. */
    private static boolean columnsMatch(List<float[]> ca, List<float[]> cb) {
        if (ca.size() < 2 || ca.size() != cb.size()) {
            return false;
        }
        for (int i = 0; i < ca.size(); i++) {
            float centreA = (ca.get(i)[0] + ca.get(i)[1]) / 2f;
            float centreB = (cb.get(i)[0] + cb.get(i)[1]) / 2f;
            if (Math.abs(centreA - centreB) > 15f) {
                return false;
            }
        }
        return true;
    }
}
