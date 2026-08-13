package stirling.software.common.pdf;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import lombok.extern.slf4j.Slf4j;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.doc.ExtractedImage;
import stirling.software.jpdfium.doc.FormField;
import stirling.software.jpdfium.doc.FormFieldType;
import stirling.software.jpdfium.doc.PdfFormReader;
import stirling.software.jpdfium.doc.PdfImageExtractor;
import stirling.software.jpdfium.model.Rect;
import stirling.software.jpdfium.text.PageText;
import stirling.software.jpdfium.text.PdfTableExtractor;
import stirling.software.jpdfium.text.PdfTextExtractor;
import stirling.software.jpdfium.text.Table;
import stirling.software.jpdfium.text.TextChar;
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
@Slf4j
public class PdfMarkdownConverter {

    private static final Pattern SOFT_HYPHEN = Pattern.compile("(\\w+)-\\n([a-z])");

    /** Width below which a TextLine is treated as a stray glyph fragment to be stitched. */
    private static final float GLYPH_WIDTH = 7.5f;

    /**
     * Fraction of the word-grid's rows a ruled grid must also find before its rows are trusted;
     * below it the table is only partly ruled and its rules would merge several rows into one band.
     */
    private static final float COMPLETE_LATTICE = MdTuning.num("stirling.md.completeLattice", 0.5f);

    /** Fraction of the page's text width a table must span to override two-column layout. */
    private static final float FULL_WIDTH = 0.6f;

    // --- Tuning switches ----------------------------------------------------
    // Read once at class load, so a run is stable. Defaults are the combined configuration; set a
    // property to restore the older behaviour.

    /** {@code placeholder} (the default), {@code none}, or {@code reference}. */
    private static final String IMAGE_MODE = MdTuning.text("stirling.md.imageMode", "placeholder");

    /** Emit AcroForm field values that live only in {@code /V}. */
    private static final boolean FORM_VALUES = MdTuning.flag("stirling.md.formValues", true);

    /** Detect tables from the page's drawn ruling lines as well as from word geometry. */
    private static final boolean RULED_TABLES = MdTuning.flag("stirling.md.ruledTables", true);

    /** How a detected table is written out. */
    private enum TableFormat {
        /** GitHub-Flavoured pipe table. Cannot express a merged cell. */
        PIPE,
        /** HTML {@code <table>}, which can. */
        HTML,
        /** HTML only where a merged cell was found; a pipe table otherwise. */
        AUTO
    }

    private static final TableFormat TABLE_FORMAT =
            switch (MdTuning.text("stirling.md.tableFormat", "pipe").toLowerCase(Locale.ROOT)) {
                case "html" -> TableFormat.HTML;
                case "auto" -> TableFormat.AUTO;
                default -> TableFormat.PIPE;
            };

    /** Use the page's ruling lines to decide where cells are merged, not the grid's shape alone. */
    private static final boolean SPAN_GEOMETRY = MdTuning.flag("stirling.md.spanGeometry", true);

    /** Drop U+00AD and rejoin extractor line fragments that are really one visual line. */
    private static final boolean TEXT_REPAIR = MdTuning.flag("stirling.md.textRepair", true);

    /** Half of {@link #TEXT_REPAIR}: strip the discretionary hyphen U+00AD. */
    private static final boolean SOFT_HYPHEN_FIX =
            TEXT_REPAIR || MdTuning.flag("stirling.md.softHyphen", false);

    /** Ablation: judge headings on the first fragment's text rather than the merged line's. */
    private static final boolean DETECT_ON_FRAGMENT =
            MdTuning.flag("stirling.md.detectOnFragment", false);

    /** Half of {@link #TEXT_REPAIR}: rejoin same-baseline extractor line fragments. */
    private static final boolean MERGE_FRAGMENTS =
            TEXT_REPAIR || MdTuning.flag("stirling.md.mergeFragments", false);

    public String convert(PdfDocument doc) throws IOException {
        List<String> rendered = new ArrayList<>();
        for (Object e : buildElements(doc)) {
            rendered.add(e instanceof TableBlock tb ? tb.render() : (String) e);
        }
        return String.join("\n\n", rendered);
    }

    /**
     * Extracts every detected table as a cell grid, in document order. Same detection as {@link
     * #convert(PdfDocument)}, so borderless tables are found and page-split ones stitched.
     */
    public List<ExtractedTable> extractTables(PdfDocument doc) throws IOException {
        return extractTables(doc, null);
    }

    /**
     * As {@link #extractTables(PdfDocument)}, but only analyses the pages asked for. Callers hold
     * the process-wide jpdfium lock, so wasted layout analysis blocks all other native PDF work.
     *
     * @param wantedPages 1-based page numbers, or {@code null} for the whole document
     */
    public List<ExtractedTable> extractTables(PdfDocument doc, Set<Integer> wantedPages)
            throws IOException {
        List<ExtractedTable> tables = new ArrayList<>();
        for (Object e : buildElements(doc, wantedPages)) {
            if (!(e instanceof TableBlock tb)) {
                continue;
            }
            List<String[]> cells = tb.cells();
            if (cells.isEmpty()) {
                continue;
            }
            List<List<String>> rows = new ArrayList<>(cells.size());
            for (String[] row : cells) {
                rows.add(List.of(row));
            }
            tables.add(new ExtractedTable(tb.page(), List.copyOf(rows)));
        }
        return List.copyOf(tables);
    }

    /** A detected table: its 1-based starting page and its rectangular cell grid. */
    public record ExtractedTable(int pageNumber, List<List<String>> rows) {}

    /**
     * Converts each page to markdown independently, indexed by 1-based page number. Nothing is
     * stitched across a page break, and pages with no extractable text are omitted, not empty.
     */
    public Map<Integer, String> convertPages(PdfDocument doc) throws IOException {
        List<PageText> allPageText = PdfTextExtractor.extractAll(doc);
        float medianSize = HeadingDetector.medianFontSize(allPageText);
        float medianHeight = HeadingDetector.medianLineHeight(allPageText);
        String bodyFont = HeadingDetector.bodyFont(allPageText);

        Map<Integer, String> pages = new LinkedHashMap<>();
        for (int pageIndex = 0; pageIndex < doc.pageCount(); pageIndex++) {
            PageLines page = pageLines(doc, allPageText, pageIndex);
            if (page.lines().isEmpty()) {
                continue;
            }
            List<Object> items =
                    buildPageItems(doc, page, pageIndex, medianSize, medianHeight, bodyFont, null);
            List<String> rendered = new ArrayList<>(items.size());
            for (Object e : items) {
                String s = e instanceof TableBlock tb ? tb.render() : (String) e;
                if (s != null && !s.isBlank()) {
                    rendered.add(s);
                }
            }
            if (!rendered.isEmpty()) {
                pages.put(pageIndex + 1, String.join("\n\n", rendered));
            }
        }
        return pages;
    }

    private List<Object> buildElements(PdfDocument doc) throws IOException {
        return buildElements(doc, null);
    }

    /**
     * @param wantedPages 1-based pages to analyse, or {@code null} for all. The page before a
     *     wanted one is analysed too, so a table starting there is stitched forward.
     */
    private List<Object> buildElements(PdfDocument doc, Set<Integer> wantedPages)
            throws IOException {
        List<PageText> allPageText = PdfTextExtractor.extractAll(doc);
        float medianSize = HeadingDetector.medianFontSize(allPageText);
        float medianHeight = HeadingDetector.medianLineHeight(allPageText);
        String bodyFont = HeadingDetector.bodyFont(allPageText);

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
            if (!pageIsWanted(wantedPages, pageIndex)) {
                prevPageTrailingTableHeader = null;
                continue;
            }
            PageLines page = pageLines(doc, allPageText, pageIndex);
            if (page.lines().isEmpty()) {
                emitImages(doc, pageIndex, output);
                prevPageTrailingTableHeader = null;
                continue;
            }

            List<Object> pageItems =
                    buildPageItems(
                            doc,
                            page,
                            pageIndex,
                            medianSize,
                            medianHeight,
                            bodyFont,
                            prevPageTrailingTableHeader);
            if (pageItems.isEmpty()) {
                continue;
            }

            mergeAcrossPageBoundary(output, pageItems);
            output.addAll(pageItems);
            prevPageTrailingTableHeader = trailingTableHeader(pageItems);
        }

        // Stitch tables split across page breaks; callers decide how to realise the elements.
        return stitchTables(output);
    }

    /** True when {@code pageIndex} is requested, or immediately precedes a requested page. */
    private static boolean pageIsWanted(Set<Integer> wantedPages, int pageIndex) {
        if (wantedPages == null) {
            return true;
        }
        int oneBased = pageIndex + 1;
        return wantedPages.contains(oneBased) || wantedPages.contains(oneBased + 1);
    }

    /**
     * One page's lines plus the layout verdict, which must be taken before text repair: merging
     * reduces the line count the two-column guard's threshold scales with.
     */
    private record PageLines(List<Line> lines, List<Float> gutters) {
        boolean twoColumnLayout() {
            return !gutters.isEmpty();
        }
    }

    /**
     * Assembled lines for one page, sorted top-to-bottom (PDF y=0 is the page bottom), or empty
     * when the page carries no text.
     */
    private static PageLines pageLines(PdfDocument doc, List<PageText> allPageText, int pageIndex) {
        List<TextLine> rawLines =
                pageIndex < allPageText.size() ? allPageText.get(pageIndex).lines() : List.of();
        List<Line> stitched = stitchGlyphs(rawLines);
        List<Float> gutters = detectGutters(stitched);
        List<Line> lines = mergeLineFragments(stitched, gutters);
        if (FORM_VALUES) {
            lines.addAll(formValueLines(doc, pageIndex, lines));
        }
        lines.sort(Comparator.comparingDouble((Line l) -> l.y).reversed());
        return new PageLines(lines, gutters);
    }

    /**
     * Builds one page's elements: rendered paragraph strings interleaved with structured {@link
     * TableBlock}s, in reading order.
     *
     * @param continuationHeader header text of a table that ended the previous page, or null
     */
    private List<Object> buildPageItems(
            PdfDocument doc,
            PageLines page,
            int pageIndex,
            float medianSize,
            float medianHeight,
            String bodyFont,
            String continuationHeader)
            throws IOException {
        List<Line> lines = page.lines();
        // Multi-column guard: only genuine two-column prose should be split. A table's column
        // gutters must NOT be mistaken for a page-layout gutter, so this looks at whether row
        // lines span the gutter (table) or stay within one side (two-column prose).
        // A table that ran to the bottom of the previous page and repeats its header at the top
        // of this page is a continuation, not a new two-column layout. Detecting the repeated
        // header keeps this page out of the two-column path so the continuation is rebuilt as a
        // table and stitched back onto the previous block.
        boolean tableContinuation =
                continuationHeader != null
                        && lines.stream()
                                .anyMatch(l -> normaliseSpace(l.text).equals(continuationHeader));

        // Merging widens lines, so re-check the pre-repair verdict here: ordering by a gutter the
        // finished lines no longer respect is worse than not splitting at all.
        List<Float> gutters = tableContinuation ? List.of() : page.gutters();
        boolean twoColumn = !gutters.isEmpty();
        boolean respected = twoColumn && gutterRespected(lines, gutters);

        // Two detectors: ruling lines give exact boundaries and see single-word cells; the word
        // grid covers what the rules do not, i.e. borderless and whitespace-aligned tables.
        Set<String> tableRowTexts = new HashSet<>();
        PageRules rules = RULED_TABLES ? readRules(doc, pageIndex) : PageRules.EMPTY;
        List<TableBlock> blocks = findTableBlocks(lines, rules, pageIndex + 1);
        if (log.isDebugEnabled()) {
            log.debug(
                    "p{} lines={} hRules={} vRules={} twoColumn={} blocks={}",
                    pageIndex,
                    lines.size(),
                    rules.horizontal().size(),
                    rules.vertical().size(),
                    !gutters.isEmpty(),
                    blocks.size());
            for (TableBlock b : blocks) {
                List<String[]> cs = b.cells();
                log.debug(
                        "block top={} bot={} ruled={} src={} rows={} cells={}x{} "
                                + "grid={} spans={} owns={}",
                        b.top(),
                        b.bottom(),
                        b.ruled(),
                        b.rowSource(),
                        b.rows().size(),
                        cs.size(),
                        cs.isEmpty() ? 0 : cs.get(0).length,
                        looksLikeGrid(b),
                        spansPage(b, lines),
                        ownsItsBand(b, lines));
                for (List<Line> row : b.rows()) {
                    log.debug("  row: {}", rowText(row));
                }
            }
        }
        if (twoColumn) {
            // On a multi-column page only a full-width block is a table; anything narrower sits
            // inside a column. A ruled block owning its own band has no column layout to sit in.
            blocks =
                    blocks.stream()
                            .filter(
                                    b ->
                                            (b.ruled() || looksLikeGrid(b))
                                                    && (spansPage(b, lines)
                                                            || (b.ruled()
                                                                    && ownsItsBand(b, lines))))
                            .toList();
        }
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
        List<List<Line>> segments = segmentsAround(lines, blocks, tableLines);
        if (twoColumn) {
            // A full-width table interrupts both columns, so splitting at its own vertical band
            // keeps the prose above and below it in column order.
            for (int s = 0; s < segments.size(); s++) {
                List<List<Line>> groups =
                        BAND_ORDER && respected
                                ? orderByBand(segments.get(s), gutters)
                                : legacySplit(segments.get(s));
                for (List<Line> col : groups) {
                    List<String> paras = new ArrayList<>();
                    assembleParagraphs(
                            col, medianSize, medianHeight, bodyFont, paras, tableRowTexts);
                    pageItems.addAll(paras);
                }
                if (s < blocks.size()) {
                    pageItems.add(blocks.get(s));
                }
            }
        } else {
            // Interleave tables with surrounding text by vertical position. Each block sits in its
            // own slot; non-table lines fall into the slot for their y (text above a block,
            // between blocks, or below the last). This keeps multiple tables on one page separate
            // and in reading order.
            for (int s = 0; s <= blocks.size(); s++) {
                List<String> paras = new ArrayList<>();
                assembleParagraphs(
                        segments.get(s), medianSize, medianHeight, bodyFont, paras, tableRowTexts);
                pageItems.addAll(paras);
                if (s < blocks.size()) {
                    pageItems.add(blocks.get(s));
                }
            }
        }

        emitImages(doc, pageIndex, pageItems);
        return pageItems;
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

        /** Extra extractor fragments merged into this line; empty for an unmerged line. */
        final List<TextLine> merged = new ArrayList<>();

        /** True for a line synthesised from an AcroForm value rather than page content. */
        boolean synthetic;

        Line(TextLine src) {
            this(src, src.text());
        }

        Line(TextLine src, String text) {
            this.source = src;
            this.text = text;
            this.x = src.x();
            this.y = src.y();
            this.width = src.width();
            this.height = src.height();
        }

        /** Every word on the line, in x order, across all merged fragments. */
        List<TextWord> words() {
            if (merged.isEmpty()) {
                return source.words();
            }
            List<TextWord> all = new ArrayList<>(source.words());
            for (TextLine extra : merged) {
                all.addAll(extra.words());
            }
            all.sort(Comparator.comparingDouble(TextWord::x));
            return all;
        }

        /**
         * Text to feed the heading/bold classifiers. An unmerged line keeps using the extractor's
         * own string so behaviour is unchanged when fragment merging is off.
         */
        String detectText() {
            return merged.isEmpty() || DETECT_ON_FRAGMENT ? source.text() : text;
        }

        float detectHeight() {
            return merged.isEmpty() ? source.height() : height;
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
            String t = stripSoftHyphens(l.text()).strip();
            if (t.isEmpty()) {
                continue;
            }
            if (l.width() < GLYPH_WIDTH && t.length() <= 2) {
                glyphs.add(l);
            } else {
                hosts.add(l);
            }
        }

        List<Line> lines =
                hosts.stream()
                        .map(l -> new Line(l, stripSoftHyphens(l.text())))
                        .collect(Collectors.toList());

        for (TextLine g : glyphs) {
            String gt = stripSoftHyphens(g.text()).strip();
            if (isBulletGlyph(gt)) {
                attachBullet(g, gt, lines);
            } else {
                attachInlineGlyph(g, gt, lines);
            }
        }
        return lines;
    }

    /**
     * Removes U+00AD SOFT HYPHEN: a break-opportunity marker, not a character, which PDFium hands
     * back verbatim so words come out as {@code ar<AD>e}.
     */
    private static String stripSoftHyphens(String text) {
        if (!SOFT_HYPHEN_FIX || text.indexOf('­') < 0) {
            return text;
        }
        return text.replace("­", "");
    }

    // --- Line-fragment merging ---------------------------------------------

    /** Gap below this many average character widths reads as no space at all (mid-word split). */
    private static final float NO_SPACE_GAP = 0.30f;

    /** Gap above this many average character widths is a real layout gap, so never merged. */
    private static final float MAX_MERGE_GAP = MdTuning.num("stirling.md.maxMergeGap", 1.60f);

    /**
     * Rejoins extractor fragments that are really one visual line: PDFium splits on bounding box,
     * so a run with no ascender ({@code rou}) lands apart from the rest ({@code ghly ...}).
     */
    private static List<Line> mergeLineFragments(List<Line> lines, List<Float> gutters) {
        if (!MERGE_FRAGMENTS || lines.size() < 2) {
            return lines;
        }
        // Merge within each column, so a line ending at the gutter never joins the next column's.
        if (!gutters.isEmpty()) {
            List<List<Line>> columns = splitIntoColumns(lines, gutters);
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
        float gap = wordLeftEdge(next) - wordRightEdge(host);
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
        float gap = wordLeftEdge(next) - wordRightEdge(host);
        float charWidth = fragmentCharWidth(host, next);
        String left = host.text.stripTrailing();
        String right = next.text.stripLeading();
        boolean space = gap >= charWidth * NO_SPACE_GAP;
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

    // Edges come from glyphs, not word boxes: a word box can carry its trailing space, putting the
    // right edge a whole space past the last real glyph.

    private static float wordRightEdge(Line l) {
        float edge = -Float.MAX_VALUE;
        for (TextWord w : l.words()) {
            for (TextChar c : w.chars()) {
                if (!c.isWhitespace() && !c.isNewline()) {
                    edge = Math.max(edge, c.x() + c.width());
                }
            }
        }
        return edge == -Float.MAX_VALUE ? l.x + l.width : edge;
    }

    private static float wordLeftEdge(Line l) {
        float edge = Float.MAX_VALUE;
        for (TextWord w : l.words()) {
            for (TextChar c : w.chars()) {
                if (!c.isWhitespace() && !c.isNewline()) {
                    edge = Math.min(edge, c.x());
                }
            }
        }
        return edge == Float.MAX_VALUE ? l.x : edge;
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
            lines.add(new Line(g, gt));
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
            absorb(left, g);
            absorb(left, right);
            lines.remove(right);
        } else if (left != null) {
            left.text = left.text + gt;
            left.width = Math.max(left.width, g.x() + g.width() - left.x);
            absorb(left, g);
        } else if (right != null) {
            right.text = gt + right.text;
            right.x = g.x();
            absorb(right, g);
        } else {
            lines.add(new Line(g, gt));
        }
    }

    /**
     * Records a fragment folded into {@code host} so the host's word list still covers its whole
     * extent; without it the host reports a right edge at the seam and merging sees a false gap.
     */
    private static void absorb(Line host, TextLine fragment) {
        if (MERGE_FRAGMENTS) {
            host.merged.add(fragment);
        }
    }

    private static void absorb(Line host, Line fragment) {
        if (MERGE_FRAGMENTS) {
            host.merged.add(fragment.source);
            host.merged.addAll(fragment.merged);
        }
    }

    // --- Column detection ---------------------------------------------------

    /** Ablation switch: off restores the older central-band two-column guard. */
    private static final boolean GUTTER_SCAN = MdTuning.flag("stirling.md.gutterScan", true);

    /** Order a multi-column page by horizontal band, so a spanning line splits the columns. */
    private static final boolean BAND_ORDER = MdTuning.flag("stirling.md.bandOrder", true);

    /** Narrowest run of near-empty x that can separate two columns of prose. */
    private static final float MIN_GUTTER = MdTuning.num("stirling.md.minGutter", 10f);

    /** Narrowest column worth splitting out; below this a "gutter" is just a ragged margin. */
    private static final float MIN_COLUMN = MdTuning.num("stirling.md.minColumn", 70f);

    /** Fraction of a page's lines that may cross a gutter and still leave it a gutter. */
    private static final float MAX_CROSSING = MdTuning.num("stirling.md.maxCrossing", 0.15f);

    /** Most columns recognised on one page. Beyond this the geometry is a table, not a layout. */
    private static final int MAX_COLUMNS = 4;

    /**
     * Finds the page's column gutters, or empty for a single column. The scan runs over the 5th to
     * 95th percentile of line edges, so one degenerate bounding box cannot drag it off the page.
     */
    private static List<Float> detectGutters(List<Line> lines) {
        if (lines.size() < 8) {
            return List.of();
        }
        int n = lines.size();
        float[] los = new float[n];
        float[] his = new float[n];
        for (int i = 0; i < n; i++) {
            los[i] = lineLeft(lines.get(i));
            his[i] = lineRight(lines.get(i));
        }
        float[] sortedLo = los.clone();
        float[] sortedHi = his.clone();
        java.util.Arrays.sort(sortedLo);
        java.util.Arrays.sort(sortedHi);
        float lo = sortedLo[(int) (n * 0.05f)];
        float hi = sortedHi[Math.min(n - 1, (int) (n * 0.95f))];
        if (hi - lo < 2 * MIN_COLUMN + MIN_GUTTER || !plausibleSpan(lo, hi)) {
            return List.of();
        }

        if (!GUTTER_SCAN) {
            return legacyTwoColumn(lines) ? List.of((lo + hi) / 2f) : List.of();
        }

        int maxCrossing = (int) (n * MAX_CROSSING);
        int start = -1;
        List<float[]> bands = new ArrayList<>();
        // Stepped as an int: past 2^24 a float can no longer represent x + 1, so a float counter
        // over a crafted coordinate stops advancing and spins forever.
        int scanFrom = (int) Math.floor(lo + MIN_COLUMN);
        int scanTo = (int) Math.ceil(hi - MIN_COLUMN);
        for (int xi = scanFrom; xi <= scanTo; xi++) {
            float x = xi;
            int crossing = 0;
            for (int i = 0; i < n; i++) {
                if (los[i] < x - 2f && his[i] > x + 2f) {
                    crossing++;
                }
            }
            if (crossing <= maxCrossing) {
                if (start < 0) {
                    start = (int) x;
                }
            } else if (start >= 0) {
                bands.add(new float[] {start, x});
                start = -1;
            }
        }
        if (start >= 0) {
            bands.add(new float[] {start, hi - MIN_COLUMN});
        }

        // Widest first, so the strongest separation wins; then keep only bands MIN_COLUMN apart.
        bands.sort(Comparator.comparingDouble((float[] b) -> b[1] - b[0]).reversed());
        List<Float> gutters = new ArrayList<>();
        for (float[] b : bands) {
            if (b[1] - b[0] < MIN_GUTTER || gutters.size() >= MAX_COLUMNS - 1) {
                continue;
            }
            float mid = (b[0] + b[1]) / 2f;
            boolean tooClose = mid - lo < MIN_COLUMN || hi - mid < MIN_COLUMN;
            for (float g : gutters) {
                tooClose |= Math.abs(g - mid) < MIN_COLUMN;
            }
            if (!tooClose) {
                gutters.add(mid);
            }
        }
        gutters.sort(Comparator.naturalOrder());

        if (!gutters.isEmpty() && columnsLookLikeText(lines, gutters)) {
            return gutters;
        }
        return FALLBACK_GUTTER ? centralGutter(lines, los, his, lo, hi) : List.of();
    }

    /** Fall back to the central-band verdict when the projection finds no gutter. */
    private static final boolean FALLBACK_GUTTER =
            MdTuning.flag("stirling.md.fallbackGutter", true);

    /**
     * Rejects page geometry too wide to be real: past 2^24 a float cannot represent x + 1, so a
     * constant-step scan stops advancing. The 2000pt bound matches {@code findColumnRanges}.
     */
    private static boolean plausibleSpan(float lo, float hi) {
        return Float.isFinite(lo) && Float.isFinite(hi) && (hi - lo) <= 2000f;
    }

    /** Fallback: accepts halves of scattered labels, which read as columns but not as prose. */
    private static List<Float> centralGutter(
            List<Line> lines, float[] los, float[] his, float lo, float hi) {
        int n = lines.size();
        float centreLo = lo + (hi - lo) * 0.35f;
        float centreHi = lo + (hi - lo) * 0.65f;
        int bestCrossing = Integer.MAX_VALUE;
        float bestAt = 0f;
        int bestLeft = 0;
        int bestRight = 0;
        for (int gi = (int) Math.floor(centreLo); gi <= (int) Math.ceil(centreHi); gi += 2) {
            float gutter = gi;
            int crossing = 0;
            int left = 0;
            int right = 0;
            for (int i = 0; i < n; i++) {
                if (los[i] < gutter - 5f && his[i] > gutter + 5f) {
                    crossing++;
                } else if (his[i] <= gutter) {
                    left++;
                } else {
                    right++;
                }
            }
            if (crossing < bestCrossing) {
                bestCrossing = crossing;
                bestAt = gutter;
                bestLeft = left;
                bestRight = right;
            }
        }
        boolean ok = bestLeft >= 4 && bestRight >= 4 && bestCrossing <= (int) (n * 0.25f);
        return ok ? List.of(bestAt) : List.of();
    }

    /** Lines of at least this fraction of a column's width count as that column's body text. */
    private static final float BODY_LINE_WIDTH = MdTuning.num("stirling.md.bodyLineWidth", 0.5f);

    /** Body lines a column must hold before it is accepted as a column. */
    private static final int BODY_LINES = MdTuning.count("stirling.md.bodyLines", 4);

    /**
     * True when every carved-out column reads as running text. The projection alone cannot tell
     * prose from any other empty lane, such as the gaps between a bar chart's labels.
     */
    private static boolean columnsLookLikeText(List<Line> lines, List<Float> gutters) {
        // Judge only lines inside a column: a spanning line is assigned to one by its centre, and
        // its width would set a measure no real body line could reach.
        List<Line> inside =
                lines.stream().filter(l -> !spansGutter(l, gutters)).collect(Collectors.toList());
        List<List<Line>> columns = splitIntoColumns(inside, gutters);
        if (columns.size() < 2) {
            return false;
        }
        for (List<Line> column : columns) {
            float lo = Float.MAX_VALUE;
            float hi = -Float.MAX_VALUE;
            for (Line l : column) {
                lo = Math.min(lo, lineLeft(l));
                hi = Math.max(hi, lineRight(l));
            }
            float measure = hi - lo;
            int body = 0;
            for (Line l : column) {
                if (lineRight(l) - lineLeft(l) >= measure * BODY_LINE_WIDTH) {
                    body++;
                }
            }
            if (body < BODY_LINES || measure < MIN_COLUMN) {
                return false;
            }
        }
        return true;
    }

    /** The older whole-page guard, kept behind {@link #GUTTER_SCAN} for ablation. */
    private static boolean legacyTwoColumn(List<Line> lines) {
        float minX = Float.MAX_VALUE;
        float maxX = -Float.MAX_VALUE;
        for (Line l : lines) {
            minX = Math.min(minX, l.x);
            maxX = Math.max(maxX, l.x + l.width);
        }
        if (maxX - minX < 200f) {
            return false;
        }
        float centreLo = minX + (maxX - minX) * 0.35f;
        float centreHi = minX + (maxX - minX) * 0.65f;
        int bestCrossing = Integer.MAX_VALUE;
        int bestLeft = 0;
        int bestRight = 0;
        for (int gi = (int) Math.floor(centreLo); gi <= (int) Math.ceil(centreHi); gi += 2) {
            float gutter = gi;
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

    /** Left edge of a line's glyphs, falling back to its bounding box when it has no words. */
    private static float lineLeft(Line l) {
        float edge = Float.MAX_VALUE;
        for (TextWord w : l.words()) {
            edge = Math.min(edge, w.x());
        }
        return edge == Float.MAX_VALUE ? l.x : edge;
    }

    private static float lineRight(Line l) {
        float edge = -Float.MAX_VALUE;
        for (TextWord w : l.words()) {
            edge = Math.max(edge, w.x() + w.width());
        }
        return edge == -Float.MAX_VALUE ? l.x + l.width : edge;
    }

    /**
     * Splits lines into columns at the given gutters. A line crossing a gutter goes to the column
     * its centre falls in, never duplicated; band ordering then places it correctly.
     */
    private static List<List<Line>> splitIntoColumns(List<Line> lines, List<Float> gutters) {
        if (gutters.isEmpty()) {
            return List.of(lines);
        }
        List<List<Line>> columns = new ArrayList<>(gutters.size() + 1);
        for (int i = 0; i <= gutters.size(); i++) {
            columns.add(new ArrayList<>());
        }
        for (Line l : lines) {
            columns.get(columnOf(l, gutters)).add(l);
        }
        columns.removeIf(List::isEmpty);
        return columns;
    }

    private static int columnOf(Line l, List<Float> gutters) {
        float centre = (lineLeft(l) + lineRight(l)) / 2f;
        int col = 0;
        while (col < gutters.size() && centre > gutters.get(col)) {
            col++;
        }
        return col;
    }

    /**
     * True when the finished lines still respect the gutters the unmerged lines showed. Merging
     * widens lines, and band-ordering on a gutter half of them straddle interleaves the columns.
     */
    private static boolean gutterRespected(List<Line> lines, List<Float> gutters) {
        List<Line> real = lines.stream().filter(l -> !l.synthetic).toList();
        if (real.isEmpty()) {
            return false;
        }
        long spanning = real.stream().filter(l -> spansGutter(l, gutters)).count();
        return spanning <= real.size() * BAND_CROSSING;
    }

    /** Fraction of the finished lines that may straddle a gutter and still allow band ordering. */
    private static final float BAND_CROSSING = MdTuning.num("stirling.md.bandCrossing", 0.35f);

    /** Fallback column split: cut at the widest gap between the lines' left edges. */
    private static List<List<Line>> legacySplit(List<Line> lines) {
        List<Float> xs =
                lines.stream()
                        .filter(l -> l.width >= 40f)
                        .map(l -> l.x)
                        .sorted()
                        .collect(Collectors.toList());
        if (xs.isEmpty()) {
            return List.of(lines);
        }
        float splitAt = (xs.getFirst() + xs.getLast()) / 2f;
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
            (l.x < splitAt ? left : right).add(l);
        }
        if (left.isEmpty()) {
            return List.of(right);
        }
        if (right.isEmpty()) {
            return List.of(left);
        }
        return List.of(left, right);
    }

    /**
     * Keep a run of gutter-spanning lines in one group: a full-width banner heading is several
     * lines, and one group each would break it into that many paragraphs.
     */
    private static final boolean SPAN_RUNS = MdTuning.flag("stirling.md.spanRuns", true);

    /** Longest a line may be and still be a line of a heading rather than of a paragraph. */
    private static final int HEADING_LENGTH_WORDS = 12;

    private static boolean headingLength(Line l) {
        return wordCount(l.text) <= HEADING_LENGTH_WORDS;
    }

    /** True when a line straddles a gutter, i.e. it belongs to no single column. */
    private static boolean spansGutter(Line l, List<Float> gutters) {
        float left = lineLeft(l);
        float right = lineRight(l);
        for (float g : gutters) {
            if (left < g - 2f && right > g + 2f) {
                return true;
            }
        }
        return false;
    }

    /**
     * Orders a multi-column region as a one-level XY cut: gutter-spanning lines cut it into
     * horizontal bands, and each band's columns are emitted in turn.
     */
    private static List<List<Line>> orderByBand(List<Line> lines, List<Float> gutters) {
        List<Line> ordered = new ArrayList<>(lines);
        ordered.sort(Comparator.comparingDouble((Line l) -> l.y).reversed());
        List<List<Line>> out = new ArrayList<>();
        List<Line> band = new ArrayList<>();
        List<Line> spanning = new ArrayList<>();
        for (Line l : ordered) {
            if (spansGutter(l, gutters)) {
                if (spanning.isEmpty()) {
                    out.addAll(splitIntoColumns(band, gutters));
                    band = new ArrayList<>();
                } else if (!headingLength(l) || !headingLength(spanning.get(spanning.size() - 1))) {
                    // Only heading-length lines are kept together: a full-width paragraph or list
                    // is also a run of spanning lines, and merging those runs its items together.
                    out.add(new ArrayList<>(spanning));
                    spanning.clear();
                }
                spanning.add(l);
                if (!SPAN_RUNS) {
                    // One group per spanning line: the older behaviour, kept for ablation.
                    out.add(new ArrayList<>(spanning));
                    spanning.clear();
                }
            } else {
                if (!spanning.isEmpty()) {
                    out.add(new ArrayList<>(spanning));
                    spanning.clear();
                }
                band.add(l);
            }
        }
        if (!spanning.isEmpty()) {
            out.add(new ArrayList<>(spanning));
        }
        out.addAll(splitIntoColumns(band, gutters));
        out.removeIf(List::isEmpty);
        return out;
    }

    // --- Paragraph assembly ------------------------------------------------

    private static void assembleParagraphs(
            List<Line> lines,
            float medianSize,
            float medianHeight,
            String bodyFont,
            List<String> out,
            Set<String> tableRowTexts) {
        StringBuilder para = new StringBuilder();
        float prevBottomY = Float.MAX_VALUE;
        float prevHeight = 0f;
        boolean[] inContents = contentsRun(lines);

        for (int i = 0; i < lines.size(); i++) {
            Line line = lines.get(i);
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
            // A contents entry carries the typography of the section it points at without being
            // that section, so nothing on one is promoted or emphasised.
            boolean structural = inContents[i];

            // A field value is data, never a heading: its widget box is taller than a text line
            // and would otherwise be promoted purely on height.
            String prefix =
                    line.synthetic || structural
                            ? ""
                            : HeadingDetector.headingPrefix(
                                    line.detectText(),
                                    line.detectHeight(),
                                    line.words(),
                                    medianSize,
                                    medianHeight,
                                    bodyFont,
                                    prevHeight <= 0f || paragraphBreak);
            if (prefix.isEmpty() && !structural && contentsTitle(lines, inContents, i)) {
                // The line a contents list runs on from is its heading: a contents page is often
                // set in one face, leaving no size or weight to promote it on.
                prefix = "# ";
            }
            boolean isBullet = startsWithBullet(text);
            // A line that opens with a list marker is an item of a list, whatever it is set in.
            boolean isHeading = !prefix.isEmpty() && !(BULLET_NEVER_HEADING && isBullet);

            if (isHeading) {
                flushParagraph(para, out);
                StringBuilder heading = new StringBuilder(escapeMarkdown(text));
                int words = wordCount(text);
                int j = i;
                int k = i + 1;
                while (WRAP_HEADINGS && k < lines.size() && words < MAX_WRAPPED_HEADING_WORDS) {
                    Line next = lines.get(k);
                    String nt = repairHyphens(next.text).strip();
                    if (nt.isEmpty()) {
                        // An empty extractor record is not a break in the text; the vertical
                        // gap below decides whether the heading ended.
                        k++;
                        continue;
                    }
                    if (inContents[k] || tableRowTexts.contains(nt)) {
                        break;
                    }
                    if (!wrapsHeading(
                            lines.get(j), next, prefix, medianSize, medianHeight, bodyFont)) {
                        break;
                    }
                    heading.append(' ').append(escapeMarkdown(nt));
                    words += wordCount(nt);
                    j = k;
                    k++;
                }
                out.add(prefix + heading);
                if (j > i) {
                    i = j;
                    line = lines.get(j);
                }
            } else if (isBullet) {
                flushParagraph(para, out);
                out.add(escapeMarkdown(text));
            } else if (!line.synthetic
                    && !structural
                    && HeadingDetector.isBoldLabel(line.detectText(), line.words())) {
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

    /** Ablation switch for refusing to promote a list item to a heading. */
    private static final boolean BULLET_NEVER_HEADING =
            MdTuning.flag("stirling.md.bulletNeverHeading", true);

    /** Ablation switch for the wider list-marker set. */
    private static final boolean WIDE_BULLETS = MdTuning.flag("stirling.md.wideBullets", true);

    /** Glyphs a document may set its list markers in beyond the three already recognised. */
    private static final String EXTRA_BULLETS = "‣⁃▶●○■□" + "◆⮚➢➣➤";

    private static boolean startsWithBullet(String text) {
        if (text.isEmpty()) {
            return false;
        }
        if (text.startsWith("•") || text.startsWith("▪") || text.startsWith("◦")) {
            return true;
        }
        return WIDE_BULLETS && EXTRA_BULLETS.indexOf(text.charAt(0)) >= 0;
    }

    /** Ablation switch for joining a display heading that wraps onto further lines. */
    private static final boolean WRAP_HEADINGS = MdTuning.flag("stirling.md.wrapHeadings", true);

    /** Longest a heading may grow to by absorbing its continuation lines, in words. */
    private static final int MAX_WRAPPED_HEADING_WORDS = 24;

    /** How far a continuation line's type size may differ from the line it continues. */
    private static final float WRAP_SIZE_TOLERANCE = MdTuning.num("stirling.md.wrapSize", 0.2f);

    /** A full stop that a further sentence follows: the shape of prose, not of a heading. */
    private static final Pattern SENTENCE_BREAK = Pattern.compile("[.!?]\\s+\\p{Lu}");

    private static int wordCount(String text) {
        return text.isBlank() ? 0 : text.strip().split("\\s+").length;
    }

    /**
     * True when {@code next} continues a wrapped heading rather than starting a new one: each
     * visual line arrives separately, so an unjoined heading emits as several spurious ones.
     */
    private static boolean wrapsHeading(
            Line head,
            Line next,
            String prefix,
            float medianSize,
            float medianHeight,
            String bodyFont) {
        if (next.synthetic) {
            return false;
        }
        float height = head.detectHeight();
        if (height <= 0f) {
            return false;
        }
        // The next baseline down, not the next block. The same 0.8 the paragraph assembler uses,
        // so a heading absorbs exactly what the converter already calls one block.
        float gap = head.y - (next.y + next.height);
        if (gap > height * 0.8f || gap < -height * 0.5f) {
            return false;
        }
        float nextHeight = next.detectHeight();
        if (Math.abs(nextHeight - height) > WRAP_SIZE_TOLERANCE * Math.max(nextHeight, height)) {
            return false;
        }
        // Same column: an x-range that misses the heading's belongs to another block entirely.
        if (next.x >= head.x + head.width || head.x >= next.x + next.width) {
            return false;
        }
        // A heading does not run to a full stop and then start another sentence; the bold run-in
        // lead-in below it does, and nothing else tells the two apart.
        if (SENTENCE_BREAK.matcher(next.text).find()) {
            return false;
        }
        String nextPrefix =
                HeadingDetector.headingPrefix(
                        next.detectText(),
                        next.detectHeight(),
                        next.words(),
                        medianSize,
                        medianHeight,
                        bodyFont,
                        false);
        // Either the continuation is display type in its own right, or it is the bold remainder of
        // a run-in heading, which cannot be promoted on its own because no gap precedes it.
        return nextPrefix.equals(prefix)
                || (nextPrefix.isEmpty()
                        && HeadingDetector.isBoldLabel(next.detectText(), next.words()));
    }

    // --- Contents lists -----------------------------------------------------

    /** A leader run: the dots that carry the eye from a contents entry to its page number. */
    private static final Pattern LEADER = Pattern.compile("([.][ ]?){4,}|[.\u00b7]{3,}|\u2026{2,}");

    /** Entries this many lines long make a contents list rather than a coincidence. */
    private static final int MIN_CONTENTS_RUN = 3;

    /**
     * Marks the lines of a contents list: a run of titles joined to page numbers by leader dots,
     * which carry the typography of the sections they point at without being those sections.
     */
    private static boolean[] contentsRun(List<Line> lines) {
        boolean[] entry = new boolean[lines.size()];
        int run = 0;
        for (int i = 0; i < lines.size(); i++) {
            String t = lines.get(i).text;
            if (LEADER.matcher(t).find() && endsWithNumber(t)) {
                entry[i] = true;
                run++;
            } else {
                if (run < MIN_CONTENTS_RUN) {
                    clear(entry, i - run, i);
                }
                run = 0;
            }
        }
        if (run < MIN_CONTENTS_RUN) {
            clear(entry, lines.size() - run, lines.size());
        }
        return entry;
    }

    private static void clear(boolean[] flags, int from, int to) {
        for (int i = Math.max(0, from); i < to; i++) {
            flags[i] = false;
        }
    }

    private static boolean endsWithNumber(String text) {
        String t = text.strip();
        return !t.isEmpty() && Character.isDigit(t.charAt(t.length() - 1));
    }

    /** True for the short line a contents list runs on from: the list's own heading. */
    private static boolean contentsTitle(List<Line> lines, boolean[] inContents, int index) {
        if (index + 1 >= lines.size() || inContents[index] || !inContents[index + 1]) {
            return false;
        }
        String t = lines.get(index).text.strip();
        return !t.isEmpty() && t.split(" +").length <= 6 && !endsWithNumber(t);
    }

    // --- Word-grid table detection -----------------------------------------

    /**
     * How much of a block's row structure the page itself drew; the stronger the evidence, the
     * weaker the false-positive guards need to be.
     */
    private enum RowSource {
        /** Rows inferred from word geometry alone; nothing on the page confirms a table. */
        WORDS,
        /** Rows sit inside a region fenced by drawn rules, but the rules do not delimit them. */
        RULE_BOUNDED,
        /** Every row boundary is a drawn rule running the table's own width. */
        LATTICE;

        boolean ruleConfirmed() {
            return this != WORDS;
        }
    }

    /**
     * A detected table. Each row is a list of source lines: usually one, but more when a cell wraps
     * onto extra lines (those continuation lines are absorbed into the row they belong to).
     */
    private record TableBlock(
            List<List<Line>> rows,
            float top,
            float bottom,
            List<float[]> cols,
            boolean ruled,
            RowSource rowSource,
            int page,
            PageRules rules) {
        TableBlock(List<List<Line>> rows, float top, float bottom, int page) {
            this(rows, top, bottom, null, false, RowSource.WORDS, page, null);
        }

        /** A rules-derived block whose rows are not a drawn lattice. */
        TableBlock(List<List<Line>> rows, float top, float bottom, List<float[]> cols, int page) {
            this(rows, top, bottom, cols, true, RowSource.RULE_BOUNDED, page, null);
        }

        TableBlock(
                List<List<Line>> rows,
                float top,
                float bottom,
                List<float[]> cols,
                boolean ruled,
                RowSource rowSource,
                int page) {
            this(rows, top, bottom, cols, ruled, rowSource, page, null);
        }

        /** The same block with the page's ruling lines attached, for span recovery. */
        TableBlock withRules(PageRules pageRules) {
            return new TableBlock(rows, top, bottom, cols, ruled, rowSource, page, pageRules);
        }

        String render() {
            if (TABLE_FORMAT == TableFormat.PIPE) {
                return buildTableFromRows(rows, cols, rowSource);
            }
            CellGrid grid = buildCellGrid(rows, cols, rowSource);
            if (grid.cells().isEmpty()) {
                return "";
            }
            List<TableSpans.Cell> flatFirst;
            List<List<TableSpans.Cell>> spanned =
                    TableSpans.infer(
                            grid.cells(), grid.columns(), rowBands(), rules, SPAN_GEOMETRY);
            flatFirst = spanned.get(0);
            if (TABLE_FORMAT == TableFormat.AUTO && !TableSpans.hasSpans(spanned)) {
                return buildTableFromRows(rows, cols, rowSource);
            }
            return flatFirst.isEmpty() && spanned.size() == 1 ? "" : TableSpans.renderHtml(spanned);
        }

        /** Vertical extent of each rendered row, taken from the lines it was built from. */
        private List<TableSpans.Band> rowBands() {
            List<TableSpans.Band> bands = new ArrayList<>(rows.size());
            for (List<Line> group : rows) {
                float lo = Float.MAX_VALUE;
                float hi = -Float.MAX_VALUE;
                for (Line l : group) {
                    lo = Math.min(lo, l.y);
                    hi = Math.max(hi, l.y + l.height);
                }
                if (lo > hi) {
                    return List.of();
                }
                bands.add(new TableSpans.Band(lo, hi));
            }
            return bands;
        }

        /** Cell grid for structured consumers; empty when the block fails the table guards. */
        List<String[]> cells() {
            return buildCells(rows, cols, rowSource);
        }
    }

    /**
     * Detects table blocks on a page: ruled blocks first (exact geometry, and they see tables the
     * word-grid cannot), then word-grid blocks over whatever lines the rules did not claim.
     */
    private static List<TableBlock> findTableBlocks(List<Line> lines, PageRules rules, int page) {
        List<TableBlock> blocks = detectTableBlocks(lines, rules, page);
        if (rules == null || rules.isEmpty()) {
            return blocks;
        }
        // Every block carries the page's rules onwards: they are what a span emitter asks whether a
        // boundary between two cells was ever drawn.
        List<TableBlock> withRules = new ArrayList<>(blocks.size());
        for (TableBlock b : blocks) {
            withRules.add(b.withRules(rules));
        }
        return withRules;
    }

    private static List<TableBlock> detectTableBlocks(List<Line> lines, PageRules rules, int page) {
        List<TableBlock> ruled = RuledTables.find(lines, rules, page);
        List<TableBlock> word = findTableBlocks(lines, page);
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
     * Detects table blocks on a page. Anchor rows (lines with table-like column gaps) are grouped
     * into vertically-contiguous runs separated by large vertical gaps, so multiple separate tables
     * on one page stay separate. Non-anchor lines that fall within a run's vertical span are
     * treated as wrapped-cell continuations and absorbed into the nearest anchor row above them.
     */
    private static List<TableBlock> findTableBlocks(List<Line> lines, int page) {
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

            List<String[]> base = buildCells(rows, null, RowSource.WORDS);
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
                List<String[]> grown = buildCells(withHeader, null, RowSource.WORDS);
                if (!grown.isEmpty()
                        && grown.get(0).length == base.get(0).length
                        && filledCells(grown.get(0)) >= base.get(0).length) {
                    rows = withHeader;
                    top = header.y;
                }
            }
            blocks.add(new TableBlock(rows, top, bottom, page));
        }
        return blocks;
    }

    /** Vertical gaps, in median row gaps, within which a line above a block can be its header. */
    private static final float HEADER_GAP = MdTuning.num("stirling.md.headerGap", 1.6f);

    /**
     * Runs of words in a line separated by more than a cell gutter: a header row has one per cell,
     * a caption written across the table is a single run, which is what tells the two apart.
     */
    private static int wordGroups(List<Line> row) {
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
        float gutter = Math.max(RULED_GUTTER_FLOOR, (width / chars) * RULED_GUTTER_CHARS);
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
    private static final float HEADER_RULE_GAP = MdTuning.num("stirling.md.headerRuleGap", 2.5f);

    /** Take a header row from the drawn text above a word-grid block. */
    private static final boolean HEADER_ABOVE = MdTuning.flag("stirling.md.headerAbove", true);

    /** The nearest line above {@code top} close enough to be the block's header row. */
    private static Line headerAbove(List<Line> lines, float top, float medianGap) {
        if (!HEADER_ABOVE) {
            return null;
        }
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

    private static String buildTableFromRows(List<List<Line>> rowGroups) {
        return buildTableFromRows(rowGroups, null, RowSource.WORDS);
    }

    /**
     * Renders a table block. {@code ruledColumns} are exact column bands read from vertical ruling
     * lines; when null the columns are derived by whitespace projection instead.
     */
    private static String buildTableFromRows(
            List<List<Line>> rowGroups, List<float[]> ruledColumns, RowSource rowSource) {
        List<String[]> rows = buildCells(rowGroups, ruledColumns, rowSource);
        return rows.isEmpty() ? "" : renderGfm(rows, rows.get(0).length);
    }

    /**
     * Resolves a table block into a cell grid, or empty when it fails the false-positive guards.
     * Shared by markdown rendering and CSV export, so both see exactly the same cells.
     */
    private static List<String[]> buildCells(
            List<List<Line>> rowGroups, List<float[]> ruledColumns, RowSource rowSource) {
        return buildCellGrid(rowGroups, ruledColumns, rowSource).cells();
    }

    /**
     * A resolved table: its cells plus each column's x band. The bands let a span emitter ask
     * whether a boundary was drawn, and are lost once empty columns have been dropped.
     */
    private record CellGrid(List<String[]> cells, List<float[]> columns) {
        static final CellGrid EMPTY = new CellGrid(List.of(), List.of());
    }

    private static CellGrid buildCellGrid(
            List<List<Line>> rowGroups, List<float[]> ruledColumns, RowSource rowSource) {
        // Detect columns by vertical-whitespace projection across all lines, rather than a 1-D gap
        // threshold on pooled word x's. Pooled-gap detection is fragile when numbers are
        // right-aligned (a 10-digit value starts well left of a 7-digit one) or when sparse cells
        // sit in their own x-band. Projection asks "which x-bands are occupied across many rows",
        // which is stable under those conditions.
        List<Line> flat = rowGroups.stream().flatMap(List::stream).collect(Collectors.toList());
        // Inside a region the rules already declare a table, a narrower gutter still separates
        // columns: the wide floor only exists to stop word spacing splitting an unruled block.
        List<float[]> columns =
                ruledColumns != null
                        ? ruledColumns
                        : findColumnRanges(
                                flat,
                                rowSource.ruleConfirmed() ? RULED_GUTTER_CHARS : GUTTER_CHARS,
                                rowSource.ruleConfirmed() ? RULED_GUTTER_FLOOR : GUTTER_FLOOR);
        // A column only the header occupies is invisible to the projection, which needs a band
        // shared by several rows; but inside a ruled region a blank answer column is still one.
        boolean headerOnlyColumn = false;
        if (columns.size() < 2
                && ruledColumns == null
                && rowSource.ruleConfirmed()
                && HEADER_ONLY_COLUMNS) {
            List<float[]> retry = findColumnRanges(flat, RULED_GUTTER_CHARS, RULED_GUTTER_FLOOR, 1);
            // Only the worksheet shape: exactly one row, the first, reaches past the supported
            // column. Anything else would invent a column and swallow the headings around it.
            if (retry.size() >= 2 && retry.size() <= 15) {
                float edge = retry.get(0)[1];
                int beyond = 0;
                int firstBeyond = -1;
                for (int r = 0; r < rowGroups.size(); r++) {
                    boolean out = false;
                    for (Line l : rowGroups.get(r)) {
                        for (TextWord w : l.words()) {
                            if (!w.text().strip().isEmpty() && w.x() + w.width() / 2f > edge) {
                                out = true;
                            }
                        }
                    }
                    if (out) {
                        beyond++;
                        if (firstBeyond < 0) {
                            firstBeyond = r;
                        }
                    }
                }
                if (beyond == 1 && firstBeyond == 0 && rowGroups.size() >= 3) {
                    columns = retry;
                    headerOnlyColumn = true;
                }
            }
        }
        // Only a drawn lattice can be a one-column table; inferred from whitespace it is just a
        // run of centred lines.
        int minColumns = rowSource == RowSource.LATTICE ? 1 : 2;
        if (columns.size() < minColumns || columns.size() > 15) {
            return CellGrid.EMPTY;
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
                for (TextWord word : line.words()) {
                    String wt = word.text().strip();
                    if (wt.isEmpty()) {
                        continue;
                    }
                    float mid = word.x() + word.width() / 2f;
                    // Ruled columns are real boundaries, so a word belongs to the band that
                    // contains it; projected columns are only approximate centres, so nearest wins.
                    int col =
                            ruledColumns != null
                                    ? containingColumn(mid, columns)
                                    : nearestColumn(mid, centers);
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
        if (ruledColumns != null) {
            // A rule that is not a column separator (a cell outline, a shading edge) leaves an
            // empty column; drop those rather than emitting them across every row.
            List<Integer> keep = new ArrayList<>();
            for (int c = 0; c < cols; c++) {
                final int col = c;
                if (rows.stream().anyMatch(r -> !r[col].isEmpty())) {
                    keep.add(c);
                }
            }
            // Two is the floor whatever the rows say: one filled column means the rules drew a box
            // round a single block of text, not a table.
            if (keep.size() < 2) {
                return CellGrid.EMPTY;
            }
            if (keep.size() < cols) {
                List<String[]> trimmed = new ArrayList<>(rows.size());
                for (String[] r : rows) {
                    String[] t = new String[keep.size()];
                    for (int i = 0; i < keep.size(); i++) {
                        t[i] = r[keep.get(i)];
                    }
                    trimmed.add(t);
                }
                rows = trimmed;
                cols = keep.size();
                List<float[]> kept = new ArrayList<>(keep.size());
                for (int idx : keep) {
                    kept.add(columns.get(idx));
                }
                columns = kept;
            }
        }

        if (cols == 1) {
            // A one-column table has no cross-row alignment to check, so the evidence is the rules
            // plus the shape of the run: enough rows, nearly all carrying text.
            long filled = rows.stream().filter(r -> !r[0].isEmpty()).count();
            return rows.size() >= SINGLE_COLUMN_ROWS && filled >= rows.size() * SINGLE_COLUMN_FILLED
                    ? new CellGrid(rows, columns)
                    : CellGrid.EMPTY;
        }

        int anchorWidth = Math.max(2, Math.round(cols * 0.6f));
        long anchorRows = rows.stream().filter(r -> filledCells(r) >= anchorWidth).count();
        long multiColumnRows = rows.stream().filter(r -> filledCells(r) >= 2).count();
        // The multi-column tests ask whether a grid inferred from whitespace is real; when rows
        // and columns are both drawn there is nothing to infer, and a blank worksheet would fail.
        boolean drawnGrid =
                headerOnlyColumn
                        || (DRAWN_GRID_SPARSE
                                && ruledColumns != null
                                && rowSource == RowSource.LATTICE);
        if (drawnGrid
                ? anchorRows < 1
                : (anchorRows < 1 || multiColumnRows < 2 || multiColumnRows < rows.size() * 0.5)) {
            return CellGrid.EMPTY;
        }
        if (ruledColumns == null && isProseNotTable(rows, cols)) {
            return CellGrid.EMPTY;
        }
        return new CellGrid(rows, columns);
    }

    /** Recover a column that only the header row occupies, inside a ruled region. */
    private static final boolean HEADER_ONLY_COLUMNS =
            MdTuning.flag("stirling.md.headerOnlyColumns", true);

    /** Accept a sparse table when the page draws both its rows and its columns. */
    private static final boolean DRAWN_GRID_SPARSE =
            MdTuning.flag("stirling.md.drawnGridSparse", true);

    /** Rows a single-column ruled table needs before it is a table rather than a run of lines. */
    private static final int SINGLE_COLUMN_ROWS = 3;

    /** Fraction of a single-column table's rows that must carry text. */
    private static final float SINGLE_COLUMN_FILLED = 0.8f;

    /** Reject a block of prose that the word grid read as a table (contents list, wide columns). */
    private static final boolean PROSE_GUARD = MdTuning.flag("stirling.md.proseGuard", true);

    /** Rows of a two-column block that must end in a page number for it to be a contents list. */
    private static final float TOC_ROWS = MdTuning.num("stirling.md.tocRows", 0.65f);

    /** Mean filled-cell length above which a two-column block reads as prose, not cells. */
    private static final float PROSE_CELL = MdTuning.num("stirling.md.proseCell", 40f);

    private static final Pattern PAGE_NUMBER = Pattern.compile("[0-9]{1,4}|[ivxlcdmIVXLCDM]{1,7}");

    /** A run of spaced or solid dots, the leader of a contents line. */
    private static final Pattern DOT_LEADER = Pattern.compile("(\\.\\s*){4,}|…");

    /**
     * True when a block is running text the word grid mistook for a table: a contents list, with or
     * without dot leaders, or two columns of prose whose "cells" are whole sentences.
     */
    private static boolean isProseNotTable(List<String[]> rows, int cols) {
        if (!PROSE_GUARD || rows.isEmpty()) {
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
            return false;
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

    /** Index of the column band containing x, clamped to the first/last band outside the grid. */
    private static int containingColumn(float x, List<float[]> columns) {
        for (int i = 0; i < columns.size(); i++) {
            if (x < columns.get(i)[1]) {
                return i;
            }
        }
        return columns.size() - 1;
    }

    /**
     * Visible for testing: column detection depends only on word geometry, so tests can drive it
     * from synthetic {@link TextLine}s to exercise degenerate-coordinate handling (the crash path
     * an extreme text matrix can produce) without needing a binary PDF fixture.
     */
    static List<float[]> findColumnRangesFromLines(List<TextLine> rows) {
        return findColumnRanges(rows.stream().map(Line::new).collect(Collectors.toList()));
    }

    static List<Float> detectGuttersFromLines(List<TextLine> rows) {
        return detectGutters(rows.stream().map(Line::new).collect(Collectors.toList()));
    }

    /**
     * Visible for testing: ruled-table partitioning depends only on rule geometry, so tests can
     * drive it from synthetic rules to exercise the guards against a pathological ruling grid.
     */
    static int ruledComponentCount(List<PageRules.Rule> horizontal, List<PageRules.Rule> vertical) {
        return RuledTables.partition(RuledTables.cluster(horizontal), RuledTables.cluster(vertical))
                .size();
    }

    /** Character widths of clear space that separate two columns of an unruled block. */
    private static final float GUTTER_CHARS = 2.5f;

    /** Absolute floor, in points, on an unruled block's column gutter. */
    private static final float GUTTER_FLOOR = 10f;

    /** As {@link #GUTTER_CHARS}, for a block the page's rules already declare to be a table. */
    private static final float RULED_GUTTER_CHARS = 1.2f;

    /** As {@link #GUTTER_FLOOR}, for a block the page's rules already declare to be a table. */
    private static final float RULED_GUTTER_FLOOR = 4f;

    private static List<float[]> findColumnRanges(List<Line> rows) {
        return findColumnRanges(rows, GUTTER_CHARS, GUTTER_FLOOR);
    }

    /**
     * Finds column x-ranges by vertical-whitespace projection. Each row contributes coverage for
     * the x-bands its words occupy; a column is a contiguous band covered by a sufficient fraction
     * of rows, and the gaps between such bands are the gutters.
     */
    private static List<float[]> findColumnRanges(
            List<Line> rows, float gutterChars, float gutterFloor) {
        return findColumnRanges(rows, gutterChars, gutterFloor, 0);
    }

    /**
     * As above, but {@code minSupport} overrides how many rows must occupy an x-band for it to be a
     * column. Zero keeps the default, which scales with the row count.
     */
    private static List<float[]> findColumnRanges(
            List<Line> rows, float gutterChars, float gutterFloor, int minSupport) {
        float minX = Float.MAX_VALUE;
        float maxX = -Float.MAX_VALUE;
        for (Line l : rows) {
            for (TextWord w : l.words()) {
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
            for (TextWord w : l.words()) {
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
        int support = minSupport > 0 ? minSupport : Math.max(2, Math.round(rows.size() * 0.35f));
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
        float minGutter = Math.max(gutterFloor, charWidth * gutterChars);
        List<float[]> merged = new ArrayList<>();
        for (float[] band : columns) {
            if (!merged.isEmpty() && band[0] - merged.getLast()[1] < minGutter) {
                merged.getLast()[1] = band[1];
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
            for (TextWord w : l.words()) {
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

    /**
     * A line looks like a table row if it has at least two words separated by a gap far wider than
     * normal inter-word spacing. The threshold is derived from the line's own character width
     * rather than a document font size, because some PDFs report a unit (matrix-scaled) font size
     * that makes absolute thresholds meaningless. (Two-word rows are allowed so two-column tables
     * are detected; spurious matches are filtered later by block contiguity and column
     * consistency.)
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

    /**
     * Splits a page's non-table lines into the bands between its table blocks, band {@code s}
     * holding the lines above block {@code s}. Blocks must already be in top-to-bottom order.
     */
    private static List<List<Line>> segmentsAround(
            List<Line> lines, List<TableBlock> blocks, Set<Line> tableLines) {
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
        return segments;
    }

    /** True when two blocks overlap vertically, i.e. they describe the same table. */
    private static boolean covers(TableBlock a, TableBlock b) {
        return Math.min(a.top(), b.top()) > Math.max(a.bottom(), b.bottom());
    }

    /**
     * True when no text outside the block sits in the block's vertical band. Such a block cannot be
     * one column's worth of a two-column layout, because there is nothing in the other column.
     */
    private static boolean ownsItsBand(TableBlock block, List<Line> lines) {
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

    /** Fraction of a block's own lines that must run the page's width, not a column's. */
    private static final float SPANNING_LINES = 0.6f;

    /** Keep an unruled full-width table on a multi-column page. */
    private static final boolean WIDE_UNRULED_TABLES =
            MdTuning.flag("stirling.md.wideUnruledTables", true);

    /** Columns a full-width unruled block needs before it can outrank the page's column layout. */
    private static final int GRID_COLUMNS = MdTuning.count("stirling.md.gridColumns", 3);

    /** Mean filled-cell length above which a full-width unruled block is prose read across. */
    private static final float GRID_CELL = MdTuning.num("stirling.md.gridCell", 25f);

    /**
     * True when an unruled full-width block is really a table, not the page's own column gutter
     * read as a cell boundary: a data table's cells are short values, the gutter's are sentences.
     */
    private static boolean looksLikeGrid(TableBlock block) {
        if (!WIDE_UNRULED_TABLES) {
            return false;
        }
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
    private static boolean spansPage(TableBlock block, List<Line> lines) {
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

    /** Ruling lines of one page, or {@link PageRules#EMPTY} if the page cannot be opened. */
    private static PageRules readRules(PdfDocument doc, int pageIndex) {
        try (PdfPage page = doc.page(pageIndex)) {
            return PageRules.of(page);
        } catch (Exception e) {
            return PageRules.EMPTY;
        }
    }

    private static void emitImages(PdfDocument doc, int pageIndex, List<Object> pageItems)
            throws IOException {
        if ("none".equals(IMAGE_MODE)) {
            return;
        }
        try (PdfPage page = doc.page(pageIndex)) {
            List<ExtractedImage> images =
                    PdfImageExtractor.extract(page.rawDocHandle(), page.rawHandle(), pageIndex);
            int n = 0;
            for (ExtractedImage img : images) {
                n++;
                pageItems.add(
                        "reference".equals(IMAGE_MODE)
                                ? referenceImage(img, pageIndex, n)
                                : describeImage(img));
            }
        }
    }

    /**
     * A real Markdown image node instead of the pseudo-HTML placeholder: the metadata becomes alt
     * text and the target names the image this endpoint would have written beside the Markdown.
     */
    private static String referenceImage(ExtractedImage img, int pageIndex, int n) {
        String ext = img.suggestedExtension();
        ext = ext == null || ext.isBlank() ? "png" : ext.replaceFirst("^\\.", "");
        String alt = img.width() > 0 ? "Image " + img.width() + "x" + img.height() : "Image";
        return "![" + alt + "](image-p" + (pageIndex + 1) + "-" + n + "." + ext + ")";
    }

    // --- AcroForm field values ---------------------------------------------

    /**
     * Builds pseudo text lines for AcroForm values that exist only in {@code /V}, placed at their
     * widget rectangles so they land in reading order; values already in the content are skipped.
     */
    private static List<Line> formValueLines(PdfDocument doc, int pageIndex, List<Line> existing) {
        List<FormField> fields;
        try (PdfPage page = doc.page(pageIndex)) {
            fields = PdfFormReader.readPage(page.rawDocHandle(), page.rawHandle(), pageIndex);
        } catch (RuntimeException e) {
            // A malformed AcroForm must not sink the whole conversion; body text still stands.
            return List.of();
        }
        List<Line> out = new ArrayList<>();
        for (FormField f : fields) {
            String value = fieldText(f);
            if (value == null || value.isBlank()) {
                continue;
            }
            Rect r = f.rect();
            if (r == null || r.width() <= 0 || r.height() <= 0) {
                continue;
            }
            if (alreadyInContent(existing, value, r)) {
                continue;
            }
            out.add(syntheticLine(value, r));
        }
        return out;
    }

    /** The text a filled field contributes, or null when the field contributes nothing. */
    private static String fieldText(FormField f) {
        FormFieldType type = f.type();
        if (type == FormFieldType.PUSHBUTTON
                || type == FormFieldType.SIGNATURE
                || type == FormFieldType.UNKNOWN) {
            return null;
        }
        if (type == FormFieldType.CHECKBOX || type == FormFieldType.RADIO) {
            return f.checked() ? "[x]" : null;
        }
        String value = f.value();
        if (value == null || "Off".equals(value)) {
            return null;
        }
        return value.replace('\r', ' ').replace('\n', ' ').strip();
    }

    /** True when the extractor already found this value inside the widget's own rectangle. */
    private static boolean alreadyInContent(List<Line> lines, String value, Rect r) {
        String needle = normaliseSpace(value);
        for (Line l : lines) {
            boolean overlaps =
                    l.x < r.x() + r.width()
                            && l.x + l.width > r.x()
                            && l.y < r.y() + r.height()
                            && l.y + l.height > r.y();
            if (overlaps && normaliseSpace(l.text).contains(needle)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Wraps a field value as a one-word-per-token {@link TextLine} placed at the widget rectangle,
     * so downstream ordering, column detection and table assembly treat it like any other text.
     */
    private static Line syntheticLine(String value, Rect r) {
        String[] tokens = value.split("\\s+");
        float height = Math.min(r.height(), 14f);
        float advance = tokens.length == 0 ? r.width() : r.width() / tokens.length;
        List<TextWord> words = new ArrayList<>(tokens.length);
        for (int i = 0; i < tokens.length; i++) {
            float wx = r.x() + advance * i;
            List<stirling.software.jpdfium.text.TextChar> chars =
                    new ArrayList<>(tokens[i].length());
            float charWidth = tokens[i].isEmpty() ? advance : advance / tokens[i].length();
            for (int c = 0; c < tokens[i].length(); c++) {
                chars.add(
                        new stirling.software.jpdfium.text.TextChar(
                                c,
                                tokens[i].charAt(c),
                                wx + charWidth * c,
                                r.y(),
                                charWidth,
                                height,
                                "",
                                0f));
            }
            words.add(new TextWord(chars, wx, r.y(), advance * 0.95f, height));
        }
        TextLine line = new TextLine(words, r.x(), r.y(), r.width(), height);
        Line out = new Line(line, value);
        out.synthetic = true;
        return out;
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
        if (!(output.getLast() instanceof String last)
                || !(pageItems.getFirst() instanceof String first)) {
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
                if (columnsMatch(acc.columns(), findColumnRanges(flatten(tb.rows())))) {
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

    /**
     * Incremental {@link #findColumnRanges(List)} for a stitched table: appending a page costs
     * O(page), and the result is bit-for-bit what findColumnRanges would give for the same lines.
     */
    private static final class ColumnAccumulator {

        private int lineCount;
        private float minX = Float.MAX_VALUE;
        private float maxX = -Float.MAX_VALUE;
        private double totalWidth;
        private int totalChars;

        /** Coverage counts, cov[i] = lines covering absolute x-bucket covBase + i. */
        private int[] cov = new int[0];

        private int covBase;

        /** Set once the x-span exceeds what findColumnRanges accepts; no histogram is then kept. */
        private boolean oversized;

        private boolean[] scratch = new boolean[0];

        static ColumnAccumulator of(List<List<Line>> rows) {
            ColumnAccumulator a = new ColumnAccumulator();
            for (List<Line> row : rows) {
                for (Line l : row) {
                    a.addLine(l);
                }
            }
            return a;
        }

        void addLine(Line l) {
            lineCount++;
            List<TextWord> words = l.words();
            int lineLo = Integer.MAX_VALUE;
            int lineHi = Integer.MIN_VALUE;
            for (TextWord w : words) {
                float x0 = w.x();
                float x1 = x0 + w.width();
                minX = Math.min(minX, x0);
                maxX = Math.max(maxX, x1);
                totalWidth += w.width();
                totalChars += Math.max(1, w.text().strip().length());
                int a = (int) Math.floor(x0);
                int b = (int) Math.ceil(x1);
                if (a < lineLo) {
                    lineLo = a;
                }
                if (b > lineHi) {
                    lineHi = b;
                }
            }
            // Mirrors findColumnRanges' guard: past this span it returns no columns, so the
            // histogram is dead weight and (with crafted coordinates) unboundedly large.
            if (!oversized && (maxX - minX) > 2000f) {
                oversized = true;
                cov = null;
                scratch = null;
            }
            if (oversized || lineHi <= lineLo) {
                return;
            }
            ensureRange(lineLo, lineHi);
            int n = lineHi - lineLo;
            if (scratch.length < n) {
                scratch = new boolean[n];
            } else {
                java.util.Arrays.fill(scratch, 0, n, false);
            }
            for (TextWord w : words) {
                int a = (int) Math.floor(w.x()) - lineLo;
                int b = (int) Math.ceil(w.x() + w.width()) - lineLo;
                for (int x = a; x < b; x++) {
                    scratch[x] = true;
                }
            }
            int off = lineLo - covBase;
            for (int x = 0; x < n; x++) {
                if (scratch[x]) {
                    cov[off + x]++;
                }
            }
        }

        private void ensureRange(int lo, int hi) {
            if (cov.length == 0) {
                covBase = lo - 32;
                cov = new int[(hi - lo) + 64];
                return;
            }
            int have0 = covBase;
            int have1 = covBase + cov.length;
            if (lo >= have0 && hi <= have1) {
                return;
            }
            int newBase = Math.min(have0, lo) - 32;
            int newEnd = Math.max(have1, hi) + 32;
            int[] nc = new int[newEnd - newBase];
            System.arraycopy(cov, 0, nc, have0 - newBase, cov.length);
            cov = nc;
            covBase = newBase;
        }

        /** Exactly what findColumnRanges would return for the accumulated lines. */
        List<float[]> columns() {
            if (oversized || maxX <= minX || (maxX - minX) > 2000f) {
                return List.of();
            }
            int lo = (int) Math.floor(minX);
            int span = Math.min((int) Math.ceil(maxX) - lo + 1, 2001);
            int support = Math.max(2, Math.round(lineCount * 0.35f));
            List<float[]> columns = new ArrayList<>();
            int start = -1;
            for (int x = 0; x < span; x++) {
                int idx = lo + x - covBase;
                int c = (idx >= 0 && idx < cov.length) ? cov[idx] : 0;
                boolean isColumn = c >= support;
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

            float charWidth = totalChars == 0 ? 6f : (float) (totalWidth / totalChars);
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
                return rowText(tb.rows().getFirst());
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
            if (!sb.isEmpty()) {
                sb.append(' ');
            }
            sb.append(l.text);
        }
        return normaliseSpace(sb.toString());
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

    // --- Ruled table detection ----------------------------------------------

    /**
     * Builds table blocks from a page's ruling lines, which carry the grid explicitly: whitespace
     * projection cannot see single-word or wrapped cells, as they leave no wide gap.
     */
    private static final class RuledTables {

        /** Rules within this distance are the same drawn line (double strokes, overdraw). */
        private static final float LEVEL_TOLERANCE = 2.5f;

        /** Slack when testing whether a horizontal and a vertical rule touch. */
        private static final float TOUCH = 3f;

        /** Segments at one position further apart than this belong to different tables. */
        private static final float CONTIGUOUS_GAP = 8f;

        /** Largest vertical gap between two rules of one rows-only table. */
        private static final float ROWS_ONLY_GAP = 150f;

        /** How far two rules of one rows-only table may differ at either end. */
        private static final float EXTENT_TOLERANCE = 8f;

        /** Lines a rows-only group needs before two rules alone are enough to call it a table. */
        private static final int ROWS_ONLY_LINES = 4;

        /**
         * A vertical rule must cover this fraction of a region's height to be a column boundary.
         */
        private static final float COLUMN_COVERAGE = 0.5f;

        /** Fraction of a lattice's row bands that must contain text for it to be a real table. */
        private static final float FILLED_BANDS = 0.6f;

        /** Fraction of the table's width an interior rule must run to be a row boundary. */
        private static final float ROW_RULE_SPAN = MdTuning.num("stirling.md.rowRuleSpan", 0.8f);

        /** Keep only interior rules that run the table's width when reading its row bands. */
        private static final boolean WIDE_ROW_RULES =
                MdTuning.flag("stirling.md.wideRowRules", true);

        /** Keep a one-column-wide interior rule when a spanning cell sits beside it. */
        private static final boolean ROWSPAN_RULES =
                MdTuning.flag("stirling.md.rowspanRules", true);

        /**
         * Interior row rules needed before drawn bands beat text baselines. One is enough: bands
         * keep a multi-line cell whole, where baselines split every wrapped cell into its own row.
         */
        private static final int MIN_INTERIOR_RULES =
                MdTuning.count("stirling.md.minInteriorRules", 1);

        /** Fraction of a region's width every rule must run for its rows to be a drawn lattice. */
        private static final float FULL_WIDTH_RULE = 0.8f;

        private RuledTables() {}

        private static TableBlock dbgNull(String why) {
            log.debug("ruled-table build rejected: {}", why);
            return null;
        }

        /** A group of rules at the same position: {@code pos} with the union of their extents. */
        private record Level(float pos, float lo, float hi) {}

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
            List<Level> hLevels = cluster(rules.horizontal());
            List<Level> vLevels = cluster(rules.vertical());
            if (hLevels.size() < 2) {
                return List.of();
            }
            List<TableBlock> blocks = new ArrayList<>();
            for (Component part : partition(hLevels, vLevels)) {
                TableBlock b = build(part.h(), part.v(), lines, page);
                if (b != null) {
                    blocks.add(b);
                }
            }

            // Horizontal rules no grid block claimed can still be a booktabs table: rows ruled,
            // columns not drawn at all. Whatever the grid did not take is offered to that reading.
            List<Level> unclaimed = new ArrayList<>();
            for (Level h : hLevels) {
                boolean claimed = false;
                for (TableBlock b : blocks) {
                    if (h.pos() >= b.bottom() - LEVEL_TOLERANCE
                            && h.pos() <= b.top() + LEVEL_TOLERANCE) {
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
                        if (covers(existing, b)) {
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
         * Blocks for a page ruled only across its rows (booktabs style). No column geometry exists
         * to recover, so these only serve to find a table the word-grid could not anchor on.
         */
        private static List<TableBlock> rowsOnly(List<Level> levels, List<Line> lines, int page) {
            List<Level> hLevels = new ArrayList<>(levels);
            hLevels.sort(Comparator.comparingDouble(Level::pos).reversed());
            List<TableBlock> blocks = new ArrayList<>();
            List<List<Level>> groups = new ArrayList<>();
            List<Level> current = new ArrayList<>();
            current.add(hLevels.get(0));
            for (int i = 1; i < hLevels.size(); i++) {
                Level prev = current.get(current.size() - 1);
                Level l = hLevels.get(i);
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

            for (List<Level> g : groups) {
                if (g.size() < 2) {
                    continue;
                }
                float top = g.get(0).pos();
                float bottom = g.get(g.size() - 1).pos();
                float left = Float.MAX_VALUE;
                float right = -Float.MAX_VALUE;
                for (Level l : g) {
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
                List<List<Line>> rows = baselineRows(inside);
                if (rows.size() < 2
                        || buildTableFromRows(rows, null, RowSource.RULE_BOUNDED).isBlank()) {
                    continue;
                }
                blocks.add(new TableBlock(rows, top, bottom, null, page));
            }
            blocks.sort(Comparator.comparingDouble(TableBlock::top).reversed());
            return blocks;
        }

        /**
         * Merges rules at the same position into levels, but only while they stay contiguous, so
         * two tables that happen to rule at the same x are not bridged into one region.
         */
        private static List<Level> cluster(List<PageRules.Rule> rules) {
            List<PageRules.Rule> sorted = new ArrayList<>(rules);
            sorted.sort(
                    Comparator.comparingDouble(PageRules.Rule::pos)
                            .thenComparingDouble(PageRules.Rule::lo));
            List<Level> out = new ArrayList<>();
            int i = 0;
            while (i < sorted.size()) {
                float pos = sorted.get(i).pos();
                int j = i;
                while (j < sorted.size() && sorted.get(j).pos() - pos <= LEVEL_TOLERANCE) {
                    j++;
                }
                List<PageRules.Rule> same = new ArrayList<>(sorted.subList(i, j));
                same.sort(Comparator.comparingDouble(PageRules.Rule::lo));
                float lo = same.get(0).lo();
                float hi = same.get(0).hi();
                for (int k = 1; k < same.size(); k++) {
                    if (same.get(k).lo() <= hi + CONTIGUOUS_GAP) {
                        hi = Math.max(hi, same.get(k).hi());
                    } else {
                        out.add(new Level(pos, lo, hi));
                        lo = same.get(k).lo();
                        hi = same.get(k).hi();
                    }
                }
                out.add(new Level(pos, lo, hi));
                i = j;
            }
            return out;
        }

        /** One connected component of crossing rules: the levels of each family it spans. */
        private record Component(List<Level> h, List<Level> v) {}

        /**
         * Connected components of crossing rules. Membership is read once from a single union-find
         * array, as materialising an id array per component costs O(components x levels) memory a
         * crafted ruling grid can drive to out-of-memory.
         */
        private static List<Component> partition(List<Level> hLevels, List<Level> vLevels) {
            int n = hLevels.size() + vLevels.size();
            if ((long) hLevels.size() * vLevels.size() > MAX_CROSSING_TESTS) {
                log.debug(
                        "ruled-table partition skipped: {}x{} rule levels",
                        hLevels.size(),
                        vLevels.size());
                return List.of();
            }
            int[] parent = new int[n];
            for (int i = 0; i < n; i++) {
                parent[i] = i;
            }
            for (int i = 0; i < hLevels.size(); i++) {
                Level h = hLevels.get(i);
                for (int j = 0; j < vLevels.size(); j++) {
                    Level v = vLevels.get(j);
                    boolean crosses =
                            v.pos() >= h.lo() - TOUCH
                                    && v.pos() <= h.hi() + TOUCH
                                    && h.pos() >= v.lo() - TOUCH
                                    && h.pos() <= v.hi() + TOUCH;
                    if (crosses) {
                        union(parent, i, hLevels.size() + j);
                    }
                }
            }
            Map<Integer, Component> byRoot = new LinkedHashMap<>();
            for (int i = 0; i < n; i++) {
                int root = find(parent, i);
                Component c = byRoot.get(root);
                if (c == null) {
                    // Past the cap the page is line art, not tables; keep the components already
                    // found whole rather than truncating them mid-scan.
                    if (byRoot.size() >= MAX_COMPONENTS) {
                        continue;
                    }
                    c = new Component(new ArrayList<>(), new ArrayList<>());
                    byRoot.put(root, c);
                }
                if (i < hLevels.size()) {
                    c.h().add(hLevels.get(i));
                } else {
                    c.v().add(vLevels.get(i - hLevels.size()));
                }
            }
            return List.copyOf(byRoot.values());
        }

        /** Crossing tests past which a page is an operator flood rather than a readable grid. */
        private static final long MAX_CROSSING_TESTS = 4_000_000L;

        /** Rule components past which the extra blocks cannot be real tables. */
        private static final int MAX_COMPONENTS = 256;

        private static int find(int[] parent, int x) {
            while (parent[x] != x) {
                parent[x] = parent[parent[x]];
                x = parent[x];
            }
            return x;
        }

        private static void union(int[] parent, int a, int b) {
            int ra = find(parent, a);
            int rb = find(parent, b);
            if (ra != rb) {
                parent[rb] = ra;
            }
        }

        private static TableBlock build(
                List<Level> hL, List<Level> vL, List<Line> lines, int page) {
            log.debug("ruled-table build hL={} vL={}", hL.size(), vL.size());
            if (hL.size() < 2 || vL.size() < 2) {
                return dbgNull("hL/vL < 2");
            }
            hL.sort(Comparator.comparingDouble(Level::pos).reversed());
            vL.sort(Comparator.comparingDouble(Level::pos));

            // The extent is the union of both families: a table ruled only between its columns
            // takes its top and bottom from the verticals, and vice versa.
            float top = hL.get(0).pos();
            float bottom = hL.get(hL.size() - 1).pos();
            float left = vL.get(0).pos();
            float right = vL.get(vL.size() - 1).pos();
            for (Level v : vL) {
                top = Math.max(top, v.hi());
                bottom = Math.min(bottom, v.lo());
            }
            for (Level h : hL) {
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
            List<float[]> cols = columns(vL, left, right, top, bottom);

            // A row boundary is a y position, not a segment, and runs the table's width: per-cell
            // rectangles report it once per cell and also box each wrapped line inside a cell.
            float rowRuleWidth = (right - left) * ROW_RULE_SPAN;
            List<Float> interiorH = new ArrayList<>();
            List<Level> bandRules = new ArrayList<>();
            float prevWide = top;
            int i = 0;
            while (i < hL.size()) {
                float pos = hL.get(i).pos();
                int j = i;
                Level widest = hL.get(i);
                while (j < hL.size() && Math.abs(hL.get(j).pos() - pos) <= LEVEL_TOLERANCE) {
                    if (hL.get(j).hi() - hL.get(j).lo() > widest.hi() - widest.lo()) {
                        widest = hL.get(j);
                    }
                    j++;
                }
                i = j;
                if (pos <= bottom + LEVEL_TOLERANCE || pos >= top - LEVEL_TOLERANCE) {
                    bandRules.add(widest);
                    continue;
                }
                boolean wide = widest.hi() - widest.lo() >= rowRuleWidth;
                boolean keep =
                        wide
                                || !WIDE_ROW_RULES
                                || spanningNeighbour(
                                        widest, vL, inside, pos, prevWide, top - bottom);
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
                List<List<Line>> filled = latticeRows(bands, inside);
                // Most bands must carry text: a chart's axis ticks or a zebra table's stripes rule
                // many empty bands, and reading those as a table steals lines from the prose.
                if (filled.size() < (bands.size() - 1) * FILLED_BANDS) {
                    return dbgNull("filled " + filled.size() + " of bands " + (bands.size() - 1));
                }
                rows = splitCompleteBands(filled, cols);
                if (fullWidthRules(bandRules, left, right)) {
                    source = RowSource.LATTICE;
                }
            } else {
                rows = baselineRows(inside);
            }
            if (rows.size() < 2) {
                return dbgNull("rows<2");
            }

            // A grid is often ruled around its body only, leaving the header just above the top
            // rule; take it when it fits the grid's width and resolves into its columns.
            if (HEADER_ABOVE && cols != null) {
                // The header's cells are separate lines when they sit far apart, so the whole
                // band above the grid is taken, not the nearest line.
                List<Line> hdr = new ArrayList<>();
                float band = Float.MAX_VALUE;
                for (Line l : lines) {
                    if (l.y <= top
                            || l.y - top > HEADER_RULE_GAP * Math.max(l.height, 1f)
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
                    List<String[]> grown = buildCells(withHeader, cols, source);
                    if (!grown.isEmpty()
                            && filledCells(grown.get(0)) >= grown.get(0).length - 1
                            && filledCells(grown.get(0)) >= 2
                            && wordGroups(hdr) == filledCells(grown.get(0))) {
                        rows = withHeader;
                        top = band + hdr.get(0).height;
                    }
                }
            }

            TableBlock block = new TableBlock(rows, top, bottom, cols, true, source, page);
            // A block that fails the shared false-positive guards is not a table; leaving its lines
            // unclaimed lets the word-grid detector or ordinary paragraph assembly handle them.
            if (buildTableFromRows(rows, cols, source).isBlank()) {
                return dbgNull(
                        "guards rejected: rows="
                                + rows.size()
                                + " cols="
                                + (cols == null ? -1 : cols.size()));
            }
            return block;
        }

        /**
         * Splits a band whose every baseline is a complete row back into those rows: a wrapped cell
         * leaves the other columns empty on its continuation lines, a run of rows does not.
         */
        private static List<List<Line>> splitCompleteBands(
                List<List<Line>> bands, List<float[]> cols) {
            if (!SPLIT_COMPLETE_BANDS || cols == null || cols.size() < 2) {
                return bands;
            }
            List<List<Line>> out = new ArrayList<>();
            for (List<Line> band : bands) {
                List<List<Line>> baselines = baselineRows(band);
                if (baselines.size() < 2 || !allRowsComplete(baselines, cols)) {
                    out.add(band);
                    continue;
                }
                out.addAll(baselines);
            }
            return out;
        }

        /** True when every baseline group puts a word in every column band. */
        private static boolean allRowsComplete(List<List<Line>> baselines, List<float[]> cols) {
            for (List<Line> row : baselines) {
                boolean[] hit = new boolean[cols.size()];
                for (Line l : row) {
                    for (TextWord w : l.words()) {
                        if (w.text().strip().isEmpty()) {
                            continue;
                        }
                        int c = containingColumn(w.x() + w.width() / 2f, cols);
                        if (c >= 0 && c < hit.length) {
                            hit[c] = true;
                        }
                    }
                }
                for (boolean h : hit) {
                    if (!h) {
                        return false;
                    }
                }
            }
            return true;
        }

        /** Split a lattice band into its baselines when each is a complete row. */
        private static final boolean SPLIT_COMPLETE_BANDS =
                MdTuning.flag("stirling.md.splitCompleteBands", true);

        /** How near a rule end must be to a vertical rule to count as landing on it. */
        private static final float COLUMN_SNAP = 2.5f;

        /** Fraction of the table's height a vertical must run to be a column boundary. */
        private static final float COLUMN_RUN = MdTuning.num("stirling.md.columnRun", 0.5f);

        /**
         * True when a rule narrower than the table is still a row boundary: it ends on the grid's
         * own verticals and the columns it misses carry a spanning cell's text beside it.
         */
        private static boolean spanningNeighbour(
                Level rule,
                List<Level> vL,
                List<Line> inside,
                float pos,
                float above,
                float height) {
            if (!ROWSPAN_RULES) {
                return false;
            }
            // The vertical must run the table, not merely be there: a line box inside a wrapped
            // cell draws its own short verticals at its inset edges.
            float columnRun = height * COLUMN_RUN;
            boolean loOnRule = false;
            boolean hiOnRule = false;
            for (Level v : vL) {
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
         * True when every horizontal rule runs nearly the region's full width, so the rules really
         * are one table's row boundaries; legend swatches and per-cell outlines do not.
         */
        private static boolean fullWidthRules(List<Level> hL, float left, float right) {
            float width = right - left;
            if (width <= 0f) {
                return false;
            }
            for (Level h : hL) {
                if (h.hi() - h.lo() < width * FULL_WIDTH_RULE) {
                    return false;
                }
            }
            return true;
        }

        /**
         * Column bands from the vertical rules that span the region. Null when no interior rule
         * survives, since the word-grid detector guesses from whitespace better.
         */
        private static List<float[]> columns(
                List<Level> vLevels, float left, float right, float top, float bottom) {
            float height = top - bottom;
            // Per-cell strokes give one rule per row, and a row that draws no boxes breaks the run
            // in two, so strokes at one x are measured together rather than as separate runs.
            List<Level> sorted = new ArrayList<>(vLevels);
            sorted.sort(Comparator.comparingDouble(Level::pos));
            List<Float> xs = new ArrayList<>();
            int at = 0;
            while (at < sorted.size()) {
                float pos = sorted.get(at).pos();
                float covered = 0f;
                int end = at;
                while (end < sorted.size() && sorted.get(end).pos() - pos <= LEVEL_TOLERANCE) {
                    Level v = sorted.get(end);
                    covered += Math.max(0f, Math.min(top, v.hi()) - Math.max(bottom, v.lo()));
                    end++;
                }
                if (covered >= height * COLUMN_COVERAGE) {
                    xs.add(pos);
                }
                at = end;
            }
            List<Float> bounds = new ArrayList<>();
            bounds.add(left);
            for (float x : xs) {
                if (x > bounds.get(bounds.size() - 1) + LEVEL_TOLERANCE
                        && x < right - LEVEL_TOLERANCE) {
                    bounds.add(x);
                }
            }
            if (bounds.size() < 2) {
                return null;
            }
            bounds.add(right);
            List<float[]> cols = new ArrayList<>();
            for (int i = 1; i < bounds.size(); i++) {
                cols.add(new float[] {bounds.get(i - 1), bounds.get(i)});
            }
            return cols;
        }

        /** Rows delimited by horizontal rules; this is what keeps a wrapped cell as one row. */
        private static List<List<Line>> latticeRows(List<Float> bands, List<Line> inside) {
            List<List<Line>> rows = new ArrayList<>();
            for (int i = 1; i < bands.size(); i++) {
                float hi = bands.get(i - 1);
                float lo = bands.get(i);
                List<Line> band = new ArrayList<>();
                for (Line l : inside) {
                    float cy = l.y + l.height / 2f;
                    if (cy > lo && cy <= hi) {
                        band.add(l);
                    }
                }
                if (!band.isEmpty()) {
                    rows.add(band);
                }
            }
            return rows;
        }

        /**
         * Rows by baseline proximity, for a table ruled between its columns but not its rows. The
         * columns still come from the rules, which is the part whitespace projection gets wrong.
         */
        private static List<List<Line>> baselineRows(List<Line> inside) {
            List<Line> sorted = new ArrayList<>(inside);
            sorted.sort(Comparator.comparingDouble((Line l) -> l.y).reversed());
            List<Float> heights = sorted.stream().map(l -> l.height).sorted().toList();
            float sameRow = Math.max(2f, heights.get(heights.size() / 2) * 0.6f);
            List<List<Line>> rows = new ArrayList<>();
            List<Line> current = new ArrayList<>();
            float anchor = 0f;
            for (Line l : sorted) {
                if (current.isEmpty()) {
                    anchor = l.y;
                } else if (anchor - l.y > sameRow) {
                    rows.add(current);
                    current = new ArrayList<>();
                    anchor = l.y;
                }
                current.add(l);
            }
            if (!current.isEmpty()) {
                rows.add(current);
            }
            return rows;
        }
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
