package stirling.software.proprietary.pdf;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import lombok.extern.slf4j.Slf4j;

/**
 * Builds table blocks from a page's ruling lines, which carry the grid explicitly: whitespace
 * projection cannot see single-word or wrapped cells, as they leave no wide gap.
 */
@Slf4j
final class RuledTables {

    private RuledTables() {}

    /** Largest vertical gap between two rules of one rows-only table. */
    private static final float ROWS_ONLY_GAP = 150f;

    /** How far two rules of one rows-only table may differ at either end. */
    private static final float EXTENT_TOLERANCE = 8f;

    /** Lines a rows-only group needs before two rules alone are enough to call it a table. */
    private static final int ROWS_ONLY_LINES = 4;

    /** Fraction of a lattice's row bands that must contain text for it to be a real table. */
    private static final float FILLED_BANDS = 0.6f;

    /** Fraction of the table's width an interior rule must run to be a row boundary. */
    private static final float ROW_RULE_SPAN = 0.8f;

    /**
     * Interior row rules needed before drawn bands beat text baselines. One is enough: bands keep a
     * multi-line cell whole, where baselines split every wrapped cell into its own row.
     */
    private static final int MIN_INTERIOR_RULES = 1;

    /** Fraction of a region's width every rule must run for its rows to be a drawn lattice. */
    private static final float FULL_WIDTH_RULE = 0.8f;

    private static TableBlock dbgNull(String why) {
        log.debug("ruled-table build rejected: {}", why);
        return null;
    }

    static List<TableBlock> find(List<Line> lines, PageRules rules, int page) {
        if (rules == null || rules.isEmpty() || lines.isEmpty()) {
            return List.of();
        }
        // Synthetic AcroForm values carry no glyphs of their own, so a ruled grid must not
        // claim them: they would seed rows and columns the content stream never drew.
        lines = lines.stream().filter(l -> !l.synthetic).toList();
        if (lines.isEmpty()) {
            return List.of();
        }
        List<RuleGrid.Level> hLevels = RuleGrid.cluster(rules.horizontal());
        List<RuleGrid.Level> vLevels = RuleGrid.cluster(rules.vertical());
        if (hLevels.size() < 2) {
            return List.of();
        }
        List<TableBlock> blocks = new ArrayList<>();
        for (RuleGrid.Component part : RuleGrid.partition(hLevels, vLevels)) {
            TableBlock b = build(part.h(), part.v(), lines, page);
            if (b != null) {
                blocks.add(b);
            }
        }

        // Horizontal rules no grid block claimed can still be a booktabs table: rows ruled,
        // columns not drawn at all. Whatever the grid did not take is offered to that reading.
        List<RuleGrid.Level> unclaimed = new ArrayList<>();
        for (RuleGrid.Level h : hLevels) {
            boolean claimed = false;
            for (TableBlock b : blocks) {
                if (h.pos() >= b.bottom() - RuleGrid.LEVEL_TOLERANCE
                        && h.pos() <= b.top() + RuleGrid.LEVEL_TOLERANCE) {
                    claimed = true;
                    break;
                }
            }
            if (!claimed) {
                unclaimed.add(h);
            }
        }
        if (unclaimed.size() >= 2) {
            for (TableBlock b : rowsOnly(unclaimed, lines, page)) {
                boolean overlaps = false;
                for (TableBlock existing : blocks) {
                    if (TableFinder.covers(existing, b)) {
                        overlaps = true;
                        break;
                    }
                }
                if (!overlaps) {
                    blocks.add(b);
                }
            }
        }
        blocks.sort(Comparator.comparingDouble(TableBlock::top).reversed());
        return blocks;
    }

    /**
     * Blocks for a page ruled only across its rows (booktabs style). No column geometry exists to
     * recover, so these only serve to find a table the word-grid could not anchor on.
     */
    private static List<TableBlock> rowsOnly(
            List<RuleGrid.Level> levels, List<Line> lines, int page) {
        List<RuleGrid.Level> hLevels = new ArrayList<>(levels);
        hLevels.sort(Comparator.comparingDouble(RuleGrid.Level::pos).reversed());
        List<TableBlock> blocks = new ArrayList<>();
        List<List<RuleGrid.Level>> groups = new ArrayList<>();
        List<RuleGrid.Level> current = new ArrayList<>();
        current.add(hLevels.get(0));
        for (int i = 1; i < hLevels.size(); i++) {
            RuleGrid.Level prev = current.get(current.size() - 1);
            RuleGrid.Level l = hLevels.get(i);
            // One booktabs table rules to a single extent; two stacked tables differ in width,
            // and grouping them would project their columns into a single band.
            if (prev.pos() - l.pos() > ROWS_ONLY_GAP
                    || Math.abs(prev.lo() - l.lo()) > EXTENT_TOLERANCE
                    || Math.abs(prev.hi() - l.hi()) > EXTENT_TOLERANCE) {
                groups.add(current);
                current = new ArrayList<>();
            }
            current.add(l);
        }
        groups.add(current);

        for (List<RuleGrid.Level> g : groups) {
            if (g.size() < 2) {
                continue;
            }
            float top = g.get(0).pos();
            float bottom = g.get(g.size() - 1).pos();
            float left = Float.MAX_VALUE;
            float right = -Float.MAX_VALUE;
            for (RuleGrid.Level l : g) {
                left = Math.min(left, l.lo());
                right = Math.max(right, l.hi());
            }
            List<Line> inside = new ArrayList<>();
            for (Line l : lines) {
                float cy = l.y + l.height / 2f;
                float cx = l.x + l.width / 2f;
                if (cy > bottom && cy < top && cx > left - 5f && cx < right + 5f) {
                    inside.add(l);
                }
            }
            // Enough text to be a table: several rows, or for a two-row table a third rule,
            // the header separator a lone pair of decorative rules does not draw.
            if (inside.size() < 2 || (inside.size() < ROWS_ONLY_LINES && g.size() < 3)) {
                continue;
            }
            List<List<Line>> rows = RuledRows.baselineRows(inside);
            if (rows.size() < 2 || TableGrid.render(rows, null, RowSource.RULE_BOUNDED).isBlank()) {
                continue;
            }
            blocks.add(new TableBlock(rows, top, bottom, null, page));
        }
        blocks.sort(Comparator.comparingDouble(TableBlock::top).reversed());
        return blocks;
    }

    private static TableBlock build(
            List<RuleGrid.Level> hL, List<RuleGrid.Level> vL, List<Line> lines, int page) {
        log.debug("ruled-table build hL={} vL={}", hL.size(), vL.size());
        if (hL.size() < 2 || vL.size() < 2) {
            return dbgNull("hL/vL < 2");
        }
        hL.sort(Comparator.comparingDouble(RuleGrid.Level::pos).reversed());
        vL.sort(Comparator.comparingDouble(RuleGrid.Level::pos));

        // The extent is the union of both families: a table ruled only between its columns
        // takes its top and bottom from the verticals, and vice versa.
        float top = hL.get(0).pos();
        float bottom = hL.get(hL.size() - 1).pos();
        float left = vL.get(0).pos();
        float right = vL.get(vL.size() - 1).pos();
        for (RuleGrid.Level v : vL) {
            top = Math.max(top, v.hi());
            bottom = Math.min(bottom, v.lo());
        }
        for (RuleGrid.Level h : hL) {
            left = Math.min(left, h.lo());
            right = Math.max(right, h.hi());
        }
        if (top - bottom < 6f || right - left < 20f) {
            return dbgNull("too small");
        }

        List<Line> inside = new ArrayList<>();
        for (Line l : lines) {
            float cy = l.y + l.height / 2f;
            float cx = l.x + l.width / 2f;
            if (cy > bottom && cy < top && cx > left - 5f && cx < right + 5f) {
                inside.add(l);
            }
        }
        if (inside.size() < 2) {
            return dbgNull("inside<2");
        }

        // Null columns mean the grid is ruled between its rows only; the block is still worth
        // building, but its columns then come from whitespace projection.
        List<float[]> cols = RuledRows.columns(vL, left, right, top, bottom);

        // A row boundary is a y position, not a segment, and runs the table's width: per-cell
        // rectangles report it once per cell and also box each wrapped line inside a cell.
        float rowRuleWidth = (right - left) * ROW_RULE_SPAN;
        List<Float> interiorH = new ArrayList<>();
        List<RuleGrid.Level> bandRules = new ArrayList<>();
        float prevWide = top;
        int i = 0;
        while (i < hL.size()) {
            float pos = hL.get(i).pos();
            int j = i;
            RuleGrid.Level widest = hL.get(i);
            while (j < hL.size() && Math.abs(hL.get(j).pos() - pos) <= RuleGrid.LEVEL_TOLERANCE) {
                if (hL.get(j).hi() - hL.get(j).lo() > widest.hi() - widest.lo()) {
                    widest = hL.get(j);
                }
                j++;
            }
            i = j;
            if (pos <= bottom + RuleGrid.LEVEL_TOLERANCE || pos >= top - RuleGrid.LEVEL_TOLERANCE) {
                bandRules.add(widest);
                continue;
            }
            boolean wide = widest.hi() - widest.lo() >= rowRuleWidth;
            boolean keep =
                    wide || spanningNeighbour(widest, vL, inside, pos, prevWide, top - bottom);
            if (!keep) {
                continue;
            }
            interiorH.add(pos);
            bandRules.add(widest);
            if (wide) {
                prevWide = pos;
            }
        }

        List<List<Line>> rows;
        RowSource source = RowSource.RULE_BOUNDED;
        if (interiorH.size() >= MIN_INTERIOR_RULES) {
            List<Float> bands = new ArrayList<>();
            bands.add(top);
            bands.addAll(interiorH);
            bands.add(bottom);
            List<List<Line>> filled = RuledRows.latticeRows(bands, inside);
            // Most bands must carry text: a chart's axis ticks or a zebra table's stripes rule
            // many empty bands, and reading those as a table steals lines from the prose.
            if (filled.size() < (bands.size() - 1) * FILLED_BANDS) {
                return dbgNull("filled " + filled.size() + " of bands " + (bands.size() - 1));
            }
            rows = RuledRows.splitCompleteBands(filled, cols);
            if (fullWidthRules(bandRules, left, right)) {
                source = RowSource.LATTICE;
            }
        } else {
            rows = RuledRows.baselineRows(inside);
        }
        if (rows.size() < 2) {
            return dbgNull("rows<2");
        }

        // A grid is often ruled around its body only, leaving the header just above the top
        // rule; take it when it fits the grid's width and resolves into its columns.
        if (cols != null) {
            // The header's cells are separate lines when they sit far apart, so the whole
            // band above the grid is taken, not the nearest line.
            List<Line> hdr = new ArrayList<>();
            float band = Float.MAX_VALUE;
            for (Line l : lines) {
                if (l.y <= top
                        || l.y - top > TableFinder.HEADER_RULE_GAP * Math.max(l.height, 1f)
                        || l.x < left - 5f
                        || l.x + l.width > right + 5f) {
                    continue;
                }
                band = Math.min(band, l.y);
            }
            for (Line l : lines) {
                if (band < Float.MAX_VALUE
                        && l.y >= band
                        && l.y <= band + 2f
                        && l.x >= left - 5f
                        && l.x + l.width <= right + 5f) {
                    hdr.add(l);
                }
            }
            if (!hdr.isEmpty()) {
                List<List<Line>> withHeader = new ArrayList<>();
                withHeader.add(hdr);
                withHeader.addAll(rows);
                List<String[]> grown = TableGrid.cells(withHeader, cols, source);
                if (!grown.isEmpty()
                        && TableGrid.filledCells(grown.get(0)) >= grown.get(0).length - 1
                        && TableGrid.filledCells(grown.get(0)) >= 2
                        && TableFinder.wordGroups(hdr) == TableGrid.filledCells(grown.get(0))) {
                    rows = withHeader;
                    top = band + hdr.get(0).height;
                }
            }
        }

        TableBlock block = new TableBlock(rows, top, bottom, cols, true, source, page);
        // A block that fails the shared false-positive guards is not a table; leaving its lines
        // unclaimed lets the word-grid detector or ordinary paragraph assembly handle them.
        if (TableGrid.render(rows, cols, source).isBlank()) {
            return dbgNull(
                    "guards rejected: rows="
                            + rows.size()
                            + " cols="
                            + (cols == null ? -1 : cols.size()));
        }
        return block;
    }

    /** How near a rule end must be to a vertical rule to count as landing on it. */
    private static final float COLUMN_SNAP = 2.5f;

    /** Fraction of the table's height a vertical must run to be a column boundary. */
    private static final float COLUMN_RUN = 0.5f;

    /**
     * True when a rule narrower than the table is still a row boundary: it ends on the grid's own
     * verticals and the columns it misses carry a spanning cell's text beside it.
     */
    private static boolean spanningNeighbour(
            RuleGrid.Level rule,
            List<RuleGrid.Level> vL,
            List<Line> inside,
            float pos,
            float above,
            float height) {
        // The vertical must run the table, not merely be there: a line box inside a wrapped
        // cell draws its own short verticals at its inset edges.
        float columnRun = height * COLUMN_RUN;
        boolean loOnRule = false;
        boolean hiOnRule = false;
        for (RuleGrid.Level v : vL) {
            if (v.hi() - v.lo() < columnRun) {
                continue;
            }
            if (Math.abs(v.pos() - rule.lo()) <= COLUMN_SNAP) {
                loOnRule = true;
            }
            if (Math.abs(v.pos() - rule.hi()) <= COLUMN_SNAP) {
                hiOnRule = true;
            }
        }
        if (!loOnRule || !hiOnRule) {
            return false;
        }
        // The spanning cell's text must sit beside the rule anywhere in the row the last
        // full-width boundary opened: it is written once, at the top of the span.
        for (Line l : inside) {
            float cy = l.y + l.height / 2f;
            float cx = l.x + l.width / 2f;
            if (cy > pos && cy < above && (cx < rule.lo() || cx > rule.hi())) {
                return true;
            }
        }
        return false;
    }

    /**
     * True when every horizontal rule runs nearly the region's full width, so the rules really are
     * one table's row boundaries; legend swatches and per-cell outlines do not.
     */
    private static boolean fullWidthRules(List<RuleGrid.Level> hL, float left, float right) {
        float width = right - left;
        if (width <= 0f) {
            return false;
        }
        for (RuleGrid.Level h : hL) {
            if (h.hi() - h.lo() < width * FULL_WIDTH_RULE) {
                return false;
            }
        }
        return true;
    }
}
