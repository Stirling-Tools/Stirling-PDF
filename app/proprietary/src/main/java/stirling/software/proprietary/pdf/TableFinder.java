package stirling.software.proprietary.pdf;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import stirling.software.jpdfium.text.TextWord;

/**
 * Finds one page's table blocks and reconciles the two detectors: where both see a table, rows come
 * from the text and columns from the rules.
 */
final class TableFinder {

    private TableFinder() {}

    /**
     * Fraction of the word grid's rows a ruled grid must also find before its rows are trusted;
     * below it the rules would merge several rows into one band.
     */
    private static final float COMPLETE_LATTICE = 0.5f;

    /**
     * Detects a page's table blocks: ruled blocks first, then word-grid blocks over whatever lines
     * the rules did not claim.
     */
    static List<TableBlock> find(List<Line> lines, PageRules rules, int page) {
        List<TableBlock> ruled = RuledTables.find(lines, rules, page);
        List<TableBlock> word = fromWordGrid(lines, page);
        if (ruled.isEmpty()) {
            return word;
        }

        // Where both detectors see the same table, keep the word-grid's rows (read from the text)
        // but take the columns from the rules, which are exact where projection only guesses.
        List<TableBlock> all = new ArrayList<>();
        Set<TableBlock> usedRules = new HashSet<>();
        for (TableBlock w : word) {
            TableBlock match = null;
            for (TableBlock r : ruled) {
                // Only a grid with real column rules can improve on the word-grid; one ruled
                // across its rows alone contributes detection, never geometry.
                if (r.cols() != null && covers(w, r)) {
                    match = r;
                    break;
                }
            }
            if (match == null) {
                // No column rules, but a rules-only grid over the same lines still confirms that a
                // table is here. The word-grid's own reading of it stands, now rule-backed.
                TableBlock evidence = null;
                for (TableBlock r : ruled) {
                    if (r.cols() == null && w.top() > r.bottom() && w.bottom() < r.top()) {
                        evidence = r;
                        break;
                    }
                }
                if (evidence == null) {
                    all.add(w);
                } else {
                    usedRules.add(evidence);
                    all.add(
                            new TableBlock(
                                    w.rows(),
                                    w.top(),
                                    w.bottom(),
                                    null,
                                    true,
                                    RowSource.WORDS,
                                    w.page()));
                }
            } else if (match.rows().size() >= w.rows().size() * COMPLETE_LATTICE) {
                // The rules cover nearly every row, so take the whole grid from them; one ruled
                // grid can span several word-grid blocks, so emit it only once.
                if (usedRules.add(match)) {
                    all.add(match);
                }
            } else {
                // Only some row boundaries are drawn: rows from the text, columns from the rules.
                usedRules.add(match);
                all.add(
                        new TableBlock(
                                w.rows(),
                                w.top(),
                                w.bottom(),
                                match.cols(),
                                true,
                                RowSource.WORDS,
                                w.page()));
            }
        }
        // A ruled table the word-grid never saw (single-word or wrapped cells leave it no wide gap
        // to anchor on) is emitted from its rules alone.
        for (TableBlock r : ruled) {
            if (usedRules.contains(r)) {
                continue;
            }
            boolean covered =
                    all.stream().anyMatch(b -> b.top() > r.bottom() && b.bottom() < r.top());
            if (!covered) {
                all.add(r);
            }
        }
        all.sort(Comparator.comparingDouble(TableBlock::top).reversed());
        return all;
    }

    /**
     * Detects table blocks from word geometry: anchor rows grouped into contiguous runs, with
     * non-anchor lines inside a run absorbed as wrapped cells.
     */
    private static List<TableBlock> fromWordGrid(List<Line> lines, int page) {
        List<Line> cands =
                lines.stream()
                        .filter(l -> !l.synthetic && isTableCandidate(l.words()))
                        .sorted(Comparator.comparingDouble((Line l) -> l.y).reversed())
                        .collect(Collectors.toList());
        if (cands.size() < 2) {
            return List.of();
        }

        List<Float> gaps = new ArrayList<>();
        for (int i = 1; i < cands.size(); i++) {
            gaps.add(cands.get(i - 1).y - cands.get(i).y);
        }
        List<Float> sorted = new ArrayList<>(gaps);
        sorted.sort(Comparator.naturalOrder());
        float medianGap = sorted.get(sorted.size() / 2);
        float splitThreshold = Math.max(medianGap * 2.5f, medianGap + 6f);

        List<List<Line>> anchorGroups = new ArrayList<>();
        List<Line> current = new ArrayList<>();
        current.add(cands.getFirst());
        for (int i = 1; i < cands.size(); i++) {
            float gap = cands.get(i - 1).y - cands.get(i).y;
            if (gap > splitThreshold) {
                anchorGroups.add(current);
                current = new ArrayList<>();
            }
            current.add(cands.get(i));
        }
        anchorGroups.add(current);

        // Synthetic form values are kept out of the table path: they must not seed a column layout
        // or be absorbed as wrapped cells, as they were never in the content stream.
        List<Line> nonCandidates =
                lines.stream()
                        .filter(l -> !l.synthetic && !isTableCandidate(l.words()))
                        .collect(Collectors.toList());

        List<TableBlock> blocks = new ArrayList<>();
        for (List<Line> anchors : anchorGroups) {
            if (anchors.size() < 2) {
                continue;
            }
            float top = anchors.getFirst().y;
            float bottom = anchors.getLast().y;

            // Each anchor seeds a row; absorb wrapped continuation lines (non-anchors within the
            // run's vertical span, with a little slack below the last row) into the anchor above.
            List<List<Line>> rows = new ArrayList<>();
            for (Line a : anchors) {
                List<Line> row = new ArrayList<>();
                row.add(a);
                rows.add(row);
            }
            for (Line nc : nonCandidates) {
                if (nc.y > top || nc.y < bottom - medianGap) {
                    continue;
                }
                int owner = 0;
                float bestDelta = Float.MAX_VALUE;
                for (int i = 0; i < anchors.size(); i++) {
                    float delta = anchors.get(i).y - nc.y; // positive when anchor is above nc
                    if (delta >= -1f && delta < bestDelta) {
                        bestDelta = delta;
                        owner = i;
                    }
                }
                rows.get(owner).add(nc);
            }

            List<String[]> base = TableGrid.cells(rows, null, RowSource.WORDS);
            if (base.isEmpty()) {
                continue;
            }
            // A header row often has no wide gap between its cells, so the anchor test misses it.
            // The line above is kept only if its grid has the same shape, excluding captions.
            Line header = headerAbove(nonCandidates, top, medianGap);
            if (header != null) {
                List<List<Line>> withHeader = new ArrayList<>();
                withHeader.add(new ArrayList<>(List.of(header)));
                withHeader.addAll(rows);
                List<String[]> grown = TableGrid.cells(withHeader, null, RowSource.WORDS);
                if (!grown.isEmpty()
                        && grown.get(0).length == base.get(0).length
                        && TableGrid.filledCells(grown.get(0)) >= base.get(0).length) {
                    rows = withHeader;
                    top = header.y;
                }
            }
            blocks.add(new TableBlock(rows, top, bottom, page));
        }
        return blocks;
    }

    /** Vertical gaps, in median row gaps, within which a line above a block can be its header. */
    private static final float HEADER_GAP = 1.6f;

    /**
     * Runs of words separated by more than a cell gutter: a header row has one per cell, a caption
     * written across the table is a single run.
     */
    static int wordGroups(List<Line> row) {
        List<TextWord> words = new ArrayList<>();
        for (Line line : row) {
            for (TextWord w : line.words()) {
                if (!w.text().strip().isEmpty()) {
                    words.add(w);
                }
            }
        }
        if (words.isEmpty()) {
            return 0;
        }
        words.sort(Comparator.comparingDouble(TextWord::x));
        float chars = 0;
        float width = 0;
        for (TextWord w : words) {
            width += w.width();
            chars += Math.max(1, w.text().strip().length());
        }
        float gutter =
                Math.max(
                        ColumnRanges.RULED_GUTTER_FLOOR,
                        (width / chars) * ColumnRanges.RULED_GUTTER_CHARS);
        int groups = 1;
        for (int i = 1; i < words.size(); i++) {
            float gap = words.get(i).x() - (words.get(i - 1).x() + words.get(i - 1).width());
            if (gap >= gutter) {
                groups++;
            }
        }
        return groups;
    }

    /** Line heights within which a line above a ruled grid can be its header row. */
    static final float HEADER_RULE_GAP = 2.5f;

    /** The nearest line above {@code top} close enough to be the block's header row. */
    private static Line headerAbove(List<Line> lines, float top, float medianGap) {
        Line best = null;
        for (Line l : lines) {
            if (l.y <= top || l.y - top > medianGap * HEADER_GAP || l.words().size() < 2) {
                continue;
            }
            if (best == null || l.y < best.y) {
                best = l;
            }
        }
        return best;
    }

    /**
     * True when a line has two words separated by a gap far wider than word spacing. The threshold
     * comes from the line's own character width, not a document font size.
     */
    private static boolean isTableCandidate(List<TextWord> words) {
        if (words.size() < 2) {
            return false;
        }
        double totalWidth = 0;
        int totalChars = 0;
        for (TextWord w : words) {
            totalWidth += w.width();
            totalChars += Math.max(1, w.text().strip().length());
        }
        float charWidth = (float) (totalWidth / Math.max(1, totalChars));
        // A deliberate cell gap is several blank characters wide; ordinary word spaces are ~a third
        // of a character. Floor at 8pt so tiny fonts still need a real gap.
        float cellGap = Math.max(8f, charWidth * 3f);
        for (int i = 1; i < words.size(); i++) {
            TextWord prev = words.get(i - 1);
            float gap = words.get(i).x() - (prev.x() + prev.width());
            if (gap >= cellGap) {
                return true;
            }
        }
        return false;
    }

    /** True when two blocks overlap vertically, i.e. they describe the same table. */
    static boolean covers(TableBlock a, TableBlock b) {
        return Math.min(a.top(), b.top()) > Math.max(a.bottom(), b.bottom());
    }
}
