package stirling.software.common.pdf;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.doc.ExtractedImage;
import stirling.software.jpdfium.doc.PdfImageExtractor;
import stirling.software.jpdfium.model.Rect;
import stirling.software.jpdfium.text.PageText;
import stirling.software.jpdfium.text.PdfTableExtractor;
import stirling.software.jpdfium.text.PdfTextExtractor;
import stirling.software.jpdfium.text.Table;
import stirling.software.jpdfium.text.TextLine;
import stirling.software.jpdfium.text.TextWord;

/**
 * Converts a PDF to Markdown using a TextLine-driven body pipeline.
 *
 * <p>Body text is rebuilt from {@link PdfTextExtractor} {@link TextLine}s. TextLines group words
 * faithfully and keep paragraph order, so the only pre-processing needed is stitching narrow
 * standalone glyph fragments (apostrophes, quotes, asterisks, superscript footnote markers,
 * bullets) back into the line they belong to. Column layout and tables are derived from line/word
 * geometry directly.
 */
public class PdfMarkdownConverter {

    private static final Pattern SOFT_HYPHEN = Pattern.compile("(\\w+)-\\n([a-z])");

    /** Width below which a TextLine is treated as a stray glyph fragment to be stitched. */
    private static final float GLYPH_WIDTH = 7.5f;

    public String convert(PdfDocument doc) throws IOException {
        List<PageText> allPageText = PdfTextExtractor.extractAll(doc);
        float medianSize = HeadingDetector.medianFontSize(allPageText);
        float medianHeight = HeadingDetector.medianLineHeight(allPageText);

        int pageCount = doc.pageCount();
        // Elements are either rendered text (String) or a structured TableBlock. Tables stay
        // structured until after the page loop so a table split across a page break can be stitched
        // back together before rendering.
        List<Object> output = new ArrayList<>();
        // Header text of a table that ended the previous page, used to spot a continuation whose
        // header repeats at the top of the current page. Null when the previous page did not end in
        // a table.
        String prevPageTrailingTableHeader = null;

        for (int pageIndex = 0; pageIndex < pageCount; pageIndex++) {
            List<TextLine> rawLines =
                    pageIndex < allPageText.size() ? allPageText.get(pageIndex).lines() : List.of();

            // Stitch stray glyph fragments (apostrophes, asterisks, superscripts, bullets) into
            // their host lines so paragraph assembly sees faithful, complete lines.
            List<Line> lines = stitchGlyphs(rawLines);
            if (lines.isEmpty()) {
                emitImages(doc, pageIndex, output);
                prevPageTrailingTableHeader = null;
                continue;
            }

            // Sort top-to-bottom (PDF y=0 is the bottom of the page).
            lines.sort(Comparator.comparingDouble((Line l) -> l.y).reversed());

            // Multi-column guard: only genuine two-column prose should be split. A table's column
            // gutters must NOT be mistaken for a page-layout gutter, so this looks at whether row
            // lines span the gutter (table) or stay within one side (two-column prose).
            // A table that ran to the bottom of the previous page and repeats its header at the top
            // of this page is a continuation, not a new two-column layout. Detecting the repeated
            // header keeps this page out of the two-column path so the continuation is rebuilt as a
            // table and stitched back onto the previous block.
            final String continuationHeader = prevPageTrailingTableHeader;
            boolean tableContinuation =
                    continuationHeader != null
                            && lines.stream()
                                    .anyMatch(
                                            l -> normaliseSpace(l.text).equals(continuationHeader));

            boolean twoColumn = !tableContinuation && detectsTwoColumns(lines);

            // Tables are detected from text/word geometry (the word-grid detector), which handles
            // both ruled and borderless tables and places cells by column alignment. The native
            // ruled-line extractor is not used: it both mis-renders cells and double-emits rows.
            Set<String> tableRowTexts = new HashSet<>();
            List<TableBlock> blocks = twoColumn ? List.of() : findTableBlocks(lines);
            Set<Line> tableLines = new HashSet<>();
            for (TableBlock b : blocks) {
                for (List<Line> row : b.rows()) {
                    for (Line l : row) {
                        tableLines.add(l);
                        tableRowTexts.add(repairHyphens(l.text).strip());
                    }
                }
            }

            List<Object> pageItems = new ArrayList<>();
            if (twoColumn) {
                for (List<Line> col : splitIntoColumns(lines)) {
                    List<String> paras = new ArrayList<>();
                    assembleParagraphs(col, medianSize, medianHeight, paras, tableRowTexts);
                    pageItems.addAll(paras);
                }
            } else {
                // Interleave tables with surrounding text by vertical position. Each block sits in
                // its own slot; non-table lines fall into the slot for their y (text above a block,
                // between blocks, or below the last). This keeps multiple tables on one page
                // separate and in reading order.
                List<List<Line>> segments = new ArrayList<>();
                for (int s = 0; s <= blocks.size(); s++) {
                    segments.add(new ArrayList<>());
                }
                for (Line l : lines) {
                    if (tableLines.contains(l)) {
                        continue;
                    }
                    int slot = 0;
                    for (TableBlock b : blocks) {
                        if (b.bottom() > l.y) {
                            slot++;
                        }
                    }
                    segments.get(slot).add(l);
                }
                for (int s = 0; s <= blocks.size(); s++) {
                    List<String> paras = new ArrayList<>();
                    assembleParagraphs(
                            segments.get(s), medianSize, medianHeight, paras, tableRowTexts);
                    pageItems.addAll(paras);
                    if (s < blocks.size()) {
                        pageItems.add(blocks.get(s));
                    }
                }
            }

            emitImages(doc, pageIndex, pageItems);

            if (pageItems.isEmpty()) {
                continue;
            }

            mergeAcrossPageBoundary(output, pageItems);
            output.addAll(pageItems);
            prevPageTrailingTableHeader = trailingTableHeader(pageItems);
        }

        // Stitch tables split across page breaks, then render every element to Markdown.
        List<Object> stitched = stitchTables(output);
        List<String> rendered = new ArrayList<>();
        for (Object e : stitched) {
            rendered.add(e instanceof TableBlock tb ? tb.render() : (String) e);
        }
        return String.join("\n\n", rendered);
    }

    // --- Glyph stitching ---------------------------------------------------

    /** A mutable assembled line: text plus geometry used for ordering and heading detection. */
    private static final class Line {
        String text;
        float x;
        float y;
        float width;
        float height;
        final TextLine source;

        Line(TextLine src) {
            this.source = src;
            this.text = src.text();
            this.x = src.x();
            this.y = src.y();
            this.width = src.width();
            this.height = src.height();
        }
    }

    /**
     * Merges narrow glyph fragments (width &lt; {@link #GLYPH_WIDTH}) into the line they belong to.
     *
     * <ul>
     *   <li>A glyph between a left fragment that ends near it and a right fragment that starts near
     *       it (both on the same baseline) is inserted inline: {@code aren} + {@code '} + {@code t}
     *       → {@code aren't}.
     *   <li>A glyph immediately right of a line's end is appended (e.g. superscript footnote marker
     *       after a number).
     *   <li>A glyph immediately left of a line's start is prepended (e.g. footnote marker before
     *       its text).
     * </ul>
     */
    private static List<Line> stitchGlyphs(List<TextLine> raw) {
        List<TextLine> hosts = new ArrayList<>();
        List<TextLine> glyphs = new ArrayList<>();
        for (TextLine l : raw) {
            String t = l.text().strip();
            if (t.isEmpty()) {
                continue;
            }
            if (l.width() < GLYPH_WIDTH && t.length() <= 2) {
                glyphs.add(l);
            } else {
                hosts.add(l);
            }
        }

        List<Line> lines = hosts.stream().map(Line::new).collect(Collectors.toList());

        for (TextLine g : glyphs) {
            String gt = g.text().strip();
            if (isBulletGlyph(gt)) {
                attachBullet(g, gt, lines);
            } else {
                attachInlineGlyph(g, gt, lines);
            }
        }
        return lines;
    }

    private static boolean isBulletGlyph(String gt) {
        return "•".equals(gt) || "▪".equals(gt) || "◦".equals(gt);
    }

    /**
     * Attaches a bullet glyph to the body line it introduces: the closest line that begins to the
     * right of the bullet at roughly the same height or just below it.
     */
    private static void attachBullet(TextLine g, String gt, List<Line> lines) {
        Line best = null;
        float bestScore = Float.MAX_VALUE;
        for (Line h : lines) {
            if (h.x < g.x() - 2f) {
                continue;
            }
            float dy = g.y() - h.y;
            if (dy < -4f || dy > 28f) {
                continue;
            }
            float score = Math.abs(dy) + (h.x - g.x()) * 0.2f;
            if (score < bestScore) {
                bestScore = score;
                best = h;
            }
        }
        if (best != null && !best.text.startsWith("•")) {
            best.text = "• " + best.text;
            best.x = g.x();
        } else {
            lines.add(new Line(g));
        }
    }

    /**
     * Stitches a narrow inline glyph (apostrophe, quote, asterisk, superscript marker) into the
     * line it belongs to: inline between two same-baseline fragments, appended to the line that
     * ends at it, or prepended to the line that starts at it.
     */
    private static void attachInlineGlyph(TextLine g, String gt, List<Line> lines) {
        Line left = null;
        Line right = null;
        float lb = 7f;
        float rb = 7f;
        for (Line h : lines) {
            boolean sameBaseline = g.y() >= h.y - 4f && g.y() <= h.y + h.height + 5f;
            if (!sameBaseline) {
                continue;
            }
            float rightEdge = h.x + h.width;
            float dxLeft = Math.abs(rightEdge - g.x());
            if (dxLeft < lb) {
                lb = dxLeft;
                left = h;
            }
            float dxRight = Math.abs(h.x - g.x());
            if (dxRight < rb) {
                rb = dxRight;
                right = h;
            }
        }

        if (left != null && right != null && left != right && Math.abs(left.y - right.y) < 6f) {
            left.text = left.text + gt + right.text;
            left.width = (right.x + right.width) - left.x;
            lines.remove(right);
        } else if (left != null) {
            left.text = left.text + gt;
            left.width = Math.max(left.width, g.x() + g.width() - left.x);
        } else if (right != null) {
            right.text = gt + right.text;
            right.x = g.x();
        } else {
            lines.add(new Line(g));
        }
    }

    // --- Column detection (guard only) -------------------------------------

    /**
     * Returns true when the page is a genuine two-column layout. Uses line/word geometry: body
     * blocks (ignoring narrow glyph blocks) and requires a wide horizontal gutter populated on both
     * sides, so single apostrophe glyphs cannot create a false second column.
     */
    private static boolean detectsTwoColumns(List<Line> lines) {
        if (lines.size() < 8) {
            return false;
        }
        float minX = Float.MAX_VALUE;
        float maxX = -Float.MAX_VALUE;
        for (Line l : lines) {
            minX = Math.min(minX, l.x);
            maxX = Math.max(maxX, l.x + l.width);
        }
        if (maxX - minX < 200f) {
            return false;
        }

        // Scan candidate gutter positions across the central band (35%-65% of width) and pick the
        // one crossed by the fewest lines. Two-column prose has a gutter that only a handful of
        // full-width lines (title, section headings) cross; a table's rows all span the full width,
        // so every candidate gutter is crossed by most lines.
        float centreLo = minX + (maxX - minX) * 0.35f;
        float centreHi = minX + (maxX - minX) * 0.65f;
        int bestCrossing = Integer.MAX_VALUE;
        int bestLeft = 0;
        int bestRight = 0;
        for (float gutter = centreLo; gutter <= centreHi; gutter += 2f) {
            int crossing = 0;
            int leftOnly = 0;
            int rightOnly = 0;
            for (Line l : lines) {
                float lx = l.x;
                float rx = l.x + l.width;
                if (lx < gutter - 5f && rx > gutter + 5f) {
                    crossing++;
                } else if (rx <= gutter) {
                    leftOnly++;
                } else {
                    rightOnly++;
                }
            }
            if (crossing < bestCrossing) {
                bestCrossing = crossing;
                bestLeft = leftOnly;
                bestRight = rightOnly;
            }
        }

        return bestLeft >= 4 && bestRight >= 4 && bestCrossing <= (int) (lines.size() * 0.25f);
    }

    private static List<List<Line>> splitIntoColumns(List<Line> lines) {
        List<Float> xs =
                lines.stream()
                        .filter(l -> l.width >= 40f)
                        .map(l -> l.x)
                        .sorted()
                        .collect(Collectors.toList());
        if (xs.isEmpty()) {
            return List.of(lines);
        }
        float minX = xs.get(0);
        float maxX = xs.get(xs.size() - 1);
        float splitAt = (minX + maxX) / 2f;
        float biggestGap = 0;
        for (int i = 1; i < xs.size(); i++) {
            float gap = xs.get(i) - xs.get(i - 1);
            if (gap > biggestGap) {
                biggestGap = gap;
                splitAt = (xs.get(i - 1) + xs.get(i)) / 2f;
            }
        }
        List<Line> left = new ArrayList<>();
        List<Line> right = new ArrayList<>();
        for (Line l : lines) {
            if (l.x < splitAt) {
                left.add(l);
            } else {
                right.add(l);
            }
        }
        if (left.isEmpty()) {
            return List.of(right);
        }
        if (right.isEmpty()) {
            return List.of(left);
        }
        return List.of(left, right);
    }

    // --- Paragraph assembly ------------------------------------------------

    private static void assembleParagraphs(
            List<Line> lines,
            float medianSize,
            float medianHeight,
            List<String> out,
            Set<String> tableRowTexts) {
        StringBuilder para = new StringBuilder();
        float prevBottomY = Float.MAX_VALUE;
        float prevHeight = 0f;

        for (Line line : lines) {
            String text = repairHyphens(line.text).strip();
            if (text.isEmpty()) {
                continue;
            }
            if (tableRowTexts.contains(text)) {
                continue;
            }

            float blockTop = line.y + line.height;
            float gap = prevBottomY - blockTop;
            boolean paragraphBreak = prevHeight > 0f && gap > prevHeight * 0.8f;

            String prefix = HeadingDetector.headingPrefix(line.source, medianSize, medianHeight);
            boolean isHeading = !prefix.isEmpty();
            boolean isBullet = startsWithBullet(text);

            if (isHeading) {
                flushParagraph(para, out);
                out.add(prefix + escapeMarkdown(text));
            } else if (isBullet) {
                flushParagraph(para, out);
                out.add(escapeMarkdown(text));
            } else if (HeadingDetector.isBoldLabel(line.source)) {
                // Bold but not large enough to be a heading → emphasise as bold, don't promote.
                flushParagraph(para, out);
                out.add("**" + escapeMarkdown(text) + "**");
            } else if (paragraphBreak) {
                flushParagraph(para, out);
                para.append(text);
            } else {
                if (!para.isEmpty()) {
                    char fc = text.charAt(0);
                    boolean noSpace = fc == '\'' || fc == '’' || fc == '‘' || fc == '"';
                    if (!noSpace) {
                        para.append(' ');
                    }
                }
                para.append(text);
            }

            prevBottomY = line.y;
            prevHeight = line.height;
        }
        flushParagraph(para, out);
    }

    private static boolean startsWithBullet(String text) {
        return text.startsWith("•") || text.startsWith("▪") || text.startsWith("◦");
    }

    // --- Word-grid table detection -----------------------------------------

    /**
     * A detected table. Each row is a list of source lines: usually one, but more when a cell wraps
     * onto extra lines (those continuation lines are absorbed into the row they belong to).
     */
    private record TableBlock(List<List<Line>> rows, float top, float bottom) {
        String render() {
            return buildTableFromRows(rows);
        }
    }

    /**
     * Detects table blocks on a page. Anchor rows (lines with table-like column gaps) are grouped
     * into vertically-contiguous runs separated by large vertical gaps, so multiple separate tables
     * on one page stay separate. Non-anchor lines that fall within a run's vertical span are
     * treated as wrapped-cell continuations and absorbed into the nearest anchor row above them.
     */
    private static List<TableBlock> findTableBlocks(List<Line> lines) {
        List<Line> cands =
                lines.stream()
                        .filter(l -> isTableCandidate(l.source))
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
        current.add(cands.get(0));
        for (int i = 1; i < cands.size(); i++) {
            float gap = cands.get(i - 1).y - cands.get(i).y;
            if (gap > splitThreshold) {
                anchorGroups.add(current);
                current = new ArrayList<>();
            }
            current.add(cands.get(i));
        }
        anchorGroups.add(current);

        List<Line> nonCandidates =
                lines.stream()
                        .filter(l -> !isTableCandidate(l.source))
                        .collect(Collectors.toList());

        List<TableBlock> blocks = new ArrayList<>();
        for (List<Line> anchors : anchorGroups) {
            if (anchors.size() < 2) {
                continue;
            }
            float top = anchors.get(0).y;
            float bottom = anchors.get(anchors.size() - 1).y;

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

            if (buildTableFromRows(rows).isBlank()) {
                continue;
            }
            blocks.add(new TableBlock(rows, top, bottom));
        }
        return blocks;
    }

    private static String buildTableFromRows(List<List<Line>> rowGroups) {
        // Detect columns by vertical-whitespace projection across all lines, rather than a 1-D gap
        // threshold on pooled word x's. Pooled-gap detection is fragile when numbers are
        // right-aligned (a 10-digit value starts well left of a 7-digit one) or when sparse cells
        // sit in their own x-band. Projection asks "which x-bands are occupied across many rows",
        // which is stable under those conditions.
        List<Line> flat = rowGroups.stream().flatMap(List::stream).collect(Collectors.toList());
        List<float[]> columns = findColumnRanges(flat);
        if (columns.size() < 2 || columns.size() > 15) {
            return "";
        }

        float[] centers = new float[columns.size()];
        for (int i = 0; i < columns.size(); i++) {
            centers[i] = (columns.get(i)[0] + columns.get(i)[1]) / 2f;
        }

        int cols = centers.length;
        List<String[]> rows = new ArrayList<>();
        for (List<Line> rowLines : rowGroups) {
            String[] row = new String[cols];
            for (int i = 0; i < cols; i++) {
                row[i] = "";
            }
            // Top line first so a wrapped cell's words stay in reading order within the cell.
            rowLines.sort(Comparator.comparingDouble((Line l) -> l.y).reversed());
            for (Line line : rowLines) {
                for (TextWord word : line.source.words()) {
                    String wt = word.text().strip();
                    if (wt.isEmpty()) {
                        continue;
                    }
                    int col = nearestColumn(word.x() + word.width() / 2f, centers);
                    row[col] = row[col].isEmpty() ? wt : row[col] + " " + wt;
                }
            }
            rows.add(row);
        }

        // Guard against false positives while tolerating uneven rows (sparse cells, merged/spanning
        // headers). The columns already come from cross-row whitespace alignment, so a stable grid
        // exists. Additionally require: at least one "anchor" row that nearly fills the grid (so
        // the
        // column count is real, not an artefact), and that most rows are genuinely multi-column.
        int anchorWidth = Math.max(2, Math.round(cols * 0.6f));
        long anchorRows = rows.stream().filter(r -> filledCells(r) >= anchorWidth).count();
        long multiColumnRows = rows.stream().filter(r -> filledCells(r) >= 2).count();
        if (anchorRows < 1 || multiColumnRows < 2 || multiColumnRows < rows.size() * 0.5) {
            return "";
        }
        return renderGfm(rows, cols);
    }

    /**
     * Visible for testing: column detection depends only on word geometry, so tests can drive it
     * from synthetic {@link TextLine}s to exercise degenerate-coordinate handling (the crash path
     * an extreme text matrix can produce) without needing a binary PDF fixture.
     */
    static List<float[]> findColumnRangesFromLines(List<TextLine> rows) {
        return findColumnRanges(rows.stream().map(Line::new).collect(Collectors.toList()));
    }

    /**
     * Finds column x-ranges by vertical-whitespace projection. Each row contributes coverage for
     * the x-bands its words occupy; a column is a contiguous band covered by a sufficient fraction
     * of rows, and the gaps between such bands are the gutters.
     */
    private static List<float[]> findColumnRanges(List<Line> rows) {
        float minX = Float.MAX_VALUE;
        float maxX = -Float.MAX_VALUE;
        for (Line l : rows) {
            for (TextWord w : l.source.words()) {
                minX = Math.min(minX, w.x());
                maxX = Math.max(maxX, w.x() + w.width());
            }
        }
        // Real pages are under ~2000pt wide; anything larger is a malformed/crafted coordinate
        // that would allocate a multi-GB array or produce a negative span on overflow.
        if (maxX <= minX || (maxX - minX) > 2000f) {
            return List.of();
        }

        int lo = (int) Math.floor(minX);
        int span = Math.min((int) Math.ceil(maxX) - lo + 1, 2001);
        int[] coverage = new int[span];
        for (Line l : rows) {
            boolean[] covered = new boolean[span];
            for (TextWord w : l.source.words()) {
                int a = Math.max(0, (int) Math.floor(w.x()) - lo);
                int b = Math.min(span, (int) Math.ceil(w.x() + w.width()) - lo);
                for (int x = a; x < b; x++) {
                    covered[x] = true;
                }
            }
            for (int x = 0; x < span; x++) {
                if (covered[x]) {
                    coverage[x]++;
                }
            }
        }

        // A column band must be occupied by at least this many rows; below it is gutter.
        int support = Math.max(2, Math.round(rows.size() * 0.35f));
        List<float[]> columns = new ArrayList<>();
        int start = -1;
        for (int x = 0; x < span; x++) {
            boolean isColumn = coverage[x] >= support;
            if (isColumn && start < 0) {
                start = x;
            } else if (!isColumn && start >= 0) {
                columns.add(new float[] {lo + start, lo + x});
                start = -1;
            }
        }
        if (start >= 0) {
            columns.add(new float[] {(float) (lo + start), (float) (lo + span)});
        }

        // Merge bands separated by only a narrow gutter. A real column separator is several
        // characters wide; the gaps *inside* a multi-word cell (ordinary word spacing) are about
        // one character. Without this, a cell like "January 20th, 2026" — whose words align
        // vertically across every row — would be split into three spurious columns.
        float charWidth = averageCharWidth(rows);
        float minGutter = Math.max(10f, charWidth * 2.5f);
        List<float[]> merged = new ArrayList<>();
        for (float[] band : columns) {
            if (!merged.isEmpty() && band[0] - merged.get(merged.size() - 1)[1] < minGutter) {
                merged.get(merged.size() - 1)[1] = band[1];
            } else {
                merged.add(new float[] {band[0], band[1]});
            }
        }
        return merged;
    }

    private static float averageCharWidth(List<Line> rows) {
        double totalWidth = 0;
        int totalChars = 0;
        for (Line l : rows) {
            for (TextWord w : l.source.words()) {
                totalWidth += w.width();
                totalChars += Math.max(1, w.text().strip().length());
            }
        }
        return totalChars == 0 ? 6f : (float) (totalWidth / totalChars);
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

    private static int filledCells(String[] row) {
        int count = 0;
        for (String cell : row) {
            if (!cell.isEmpty()) {
                count++;
            }
        }
        return count;
    }

    private static String renderGfm(List<String[]> rows, int cols) {
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
        sb.append(buildGfmRow(rows.get(0), widths, cols)).append('\n');
        sb.append('|');
        for (int c = 0; c < cols; c++) {
            sb.append('-').append("-".repeat(widths[c])).append('-').append('|');
        }
        for (int r = 1; r < rows.size(); r++) {
            sb.append('\n').append(buildGfmRow(rows.get(r), widths, cols));
        }
        return sb.toString();
    }

    /**
     * A line looks like a table row if it has at least two words separated by a gap far wider than
     * normal inter-word spacing. The threshold is derived from the line's own character width
     * rather than a document font size, because some PDFs report a unit (matrix-scaled) font size
     * that makes absolute thresholds meaningless. (Two-word rows are allowed so two-column tables
     * are detected; spurious matches are filtered later by block contiguity and column
     * consistency.)
     */
    private static boolean isTableCandidate(TextLine line) {
        List<TextWord> words = line.words();
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
        return escapeMarkdownInline(cell);
    }

    /**
     * Escapes Markdown control characters in body text extracted from the PDF so that literal
     * characters (e.g. a line that reads {@code # Heading} or {@code [label](url)}, or an embedded
     * {@code <tag>}) are emitted as text rather than being reinterpreted as structure or raw HTML.
     * Applied to all body text — headings, paragraphs, bold labels, bullets — before emission.
     *
     * <p>The generated Markdown should still be treated as untrusted content by any downstream
     * renderer: this hardens fidelity and is defence-in-depth, not a substitute for safe rendering.
     */
    private static String escapeMarkdown(String text) {
        if (text.isEmpty()) {
            return text;
        }
        String inline = escapeMarkdownInline(text);
        return escapeLeadingBlockMarker(inline, text);
    }

    /** Escapes inline-significant Markdown characters anywhere in the string. */
    private static String escapeMarkdownInline(String text) {
        StringBuilder sb = new StringBuilder(text.length() + 8);
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            switch (c) {
                case '\\', '`', '*', '_', '[', ']', '<', '>', '|', '~' -> sb.append('\\').append(c);
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }

    /**
     * Escapes block-level markers that are only significant at the start of a line: ATX headings
     * ({@code #}), unordered list / thematic break markers ({@code -}, {@code +}), and ordered list
     * markers ({@code 1.} / {@code 1)}). {@code original} carries the unescaped leading characters,
     * none of which are altered by inline escaping, so positions line up with {@code escaped}.
     */
    private static String escapeLeadingBlockMarker(String escaped, String original) {
        char c0 = original.charAt(0);
        if (c0 == '#' || c0 == '-' || c0 == '+') {
            return "\\" + escaped;
        }
        int i = 0;
        while (i < original.length() && Character.isDigit(original.charAt(i))) {
            i++;
        }
        if (i > 0 && i < original.length()) {
            char delim = original.charAt(i);
            if (delim == '.' || delim == ')') {
                return escaped.substring(0, i) + "\\" + escaped.substring(i);
            }
        }
        return escaped;
    }

    private static String padRight(String s, int width) {
        return s.length() >= width ? s : s + " ".repeat(width - s.length());
    }

    // --- Page-level emission helpers ---------------------------------------

    private static void emitImages(PdfDocument doc, int pageIndex, List<Object> pageItems)
            throws IOException {
        try (PdfPage page = doc.page(pageIndex)) {
            List<ExtractedImage> images =
                    PdfImageExtractor.extract(page.rawDocHandle(), page.rawHandle(), pageIndex);
            for (ExtractedImage img : images) {
                pageItems.add(describeImage(img));
            }
        }
    }

    /**
     * Builds an image placeholder annotated with whatever metadata JPDFium exposes: pixel
     * dimensions, on-page placement (points), effective DPI, encoded format, colour space and bit
     * depth. Missing fields are simply omitted so the line stays valid for any image.
     */
    private static String describeImage(ExtractedImage img) {
        List<String> parts = new ArrayList<>();
        if (img.width() > 0 && img.height() > 0) {
            parts.add(img.width() + "x" + img.height() + "px");
        }
        Rect b = img.bounds();
        if (b != null && b.width() > 0 && b.height() > 0) {
            parts.add(String.format("%.0fx%.0fpt", b.width(), b.height()));
            if (img.width() > 0) {
                float dpiX = img.width() / (b.width() / 72f);
                float dpiY = img.height() / (b.height() / 72f);
                if (Float.isFinite(dpiX) && dpiX > 0) {
                    parts.add(String.format("~%.0fdpi", (dpiX + dpiY) / 2f));
                }
            }
        }
        String ext = img.suggestedExtension();
        if (ext != null && !ext.isBlank()) {
            parts.add(ext.replaceFirst("^\\.", "").toUpperCase(java.util.Locale.ROOT));
        }
        if (img.colorSpace() != null) {
            parts.add(img.colorSpace().toString());
        }
        if (img.bitsPerPixel() > 0) {
            parts.add(img.bitsPerPixel() + "bpp");
        }

        StringBuilder sb = new StringBuilder("<image redacted");
        if (!parts.isEmpty()) {
            sb.append(": ").append(String.join(", ", parts));
        }
        sb.append('>');
        return sb.toString();
    }

    private static void mergeAcrossPageBoundary(List<Object> output, List<Object> pageItems) {
        if (output.isEmpty() || pageItems.isEmpty()) {
            return;
        }
        // Only merge a sentence continuation between two text paragraphs, never into/out of a
        // table.
        if (!(output.get(output.size() - 1) instanceof String last)
                || !(pageItems.get(0) instanceof String first)) {
            return;
        }
        if (!first.isEmpty()
                && Character.isLowerCase(first.charAt(0))
                && !endsWithSentencePunctuation(last)) {
            output.set(output.size() - 1, last + " " + first);
            pageItems.remove(0);
        }
    }

    /**
     * Joins tables split across a page break. Two consecutive {@link TableBlock}s (no text between
     * them — i.e. one ended a page and the next began the following page) are merged when their
     * column layouts match; a repeated header row on the continuation is dropped.
     */
    private static List<Object> stitchTables(List<Object> elements) {
        List<Object> out = new ArrayList<>();
        for (Object e : elements) {
            if (e instanceof TableBlock tb
                    && !out.isEmpty()
                    && out.get(out.size() - 1) instanceof TableBlock prev
                    && columnsMatch(flatten(prev.rows()), flatten(tb.rows()))) {
                List<List<Line>> merged = new ArrayList<>(prev.rows());
                List<List<Line>> tail = tb.rows();
                if (!tail.isEmpty()
                        && !prev.rows().isEmpty()
                        && rowText(tail.get(0)).equals(rowText(prev.rows().get(0)))) {
                    tail = tail.subList(1, tail.size());
                }
                merged.addAll(tail);
                out.set(out.size() - 1, new TableBlock(merged, prev.top(), tb.bottom()));
            } else {
                out.add(e);
            }
        }
        return out;
    }

    private static String normaliseSpace(String s) {
        return s.strip().replaceAll("\\s+", " ");
    }

    private static List<Line> flatten(List<List<Line>> rows) {
        return rows.stream().flatMap(List::stream).collect(Collectors.toList());
    }

    /** Whitespace-normalised text of a row's lines (top to bottom), for header de-duplication. */
    /**
     * Header text of a table at the very bottom of a page, or null if the page does not end in one.
     * Trailing image placeholders are skipped; any other text after a table means it did not run to
     * the page bottom and so is not a continuation candidate.
     */
    private static String trailingTableHeader(List<Object> pageItems) {
        for (int i = pageItems.size() - 1; i >= 0; i--) {
            Object e = pageItems.get(i);
            if (e instanceof String s && s.strip().startsWith("<image redacted")) {
                continue;
            }
            if (e instanceof TableBlock tb && !tb.rows().isEmpty()) {
                return rowText(tb.rows().get(0));
            }
            return null;
        }
        return null;
    }

    private static String rowText(List<Line> row) {
        List<Line> ordered = new ArrayList<>(row);
        ordered.sort(Comparator.comparingDouble((Line l) -> l.y).reversed());
        StringBuilder sb = new StringBuilder();
        for (Line l : ordered) {
            if (sb.length() > 0) {
                sb.append(' ');
            }
            sb.append(l.text);
        }
        return normaliseSpace(sb.toString());
    }

    /** True when two table blocks have the same number of columns at near-identical x-centres. */
    private static boolean columnsMatch(List<Line> a, List<Line> b) {
        List<float[]> ca = findColumnRanges(a);
        List<float[]> cb = findColumnRanges(b);
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

    private static void flushParagraph(StringBuilder para, List<String> out) {
        if (!para.isEmpty()) {
            out.add(escapeMarkdown(para.toString()));
            para.setLength(0);
        }
    }

    private static String repairHyphens(String text) {
        return SOFT_HYPHEN.matcher(text).replaceAll("$1$2");
    }

    private static boolean endsWithSentencePunctuation(String s) {
        if (s.isEmpty()) {
            return false;
        }
        char last = s.charAt(s.length() - 1);
        return last == '.' || last == '?' || last == '!' || last == ':';
    }

    // --- Methods used by other components / tests --------------------------

    List<PageText> extractAllPageText(PdfDocument doc) throws IOException {
        return PdfTextExtractor.extractAll(doc);
    }

    List<Table> extractTables(PdfDocument doc, int pageIndex) throws IOException {
        return PdfTableExtractor.extract(doc, pageIndex);
    }

    List<String> renderTables(List<Table> tables) {
        return tables.stream().map(TableRenderer::render).toList();
    }
}
