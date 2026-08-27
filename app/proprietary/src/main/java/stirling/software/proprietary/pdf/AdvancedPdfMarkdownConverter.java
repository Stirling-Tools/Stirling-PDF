package stirling.software.proprietary.pdf;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.pdf.PdfMarkdownExtractor;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.text.PageText;
import stirling.software.jpdfium.text.PdfTextExtractor;
import stirling.software.jpdfium.text.TextLine;

/**
 * Converts a PDF to Markdown using a TextLine-driven body pipeline.
 *
 * <p>Body text is rebuilt from {@link PdfTextExtractor} {@link TextLine}s. TextLines group words
 * faithfully and keep paragraph order, so the only pre-processing needed is stitching narrow
 * standalone glyph fragments (apostrophes, quotes, asterisks, superscript footnote markers,
 * bullets) back into the line they belong to. Column layout and tables are derived from line/word
 * geometry directly.
 *
 * <p>This class is the orchestration only; each stage lives in its own class. {@link GlyphStitcher}
 * and {@link LineMerger} rebuild the lines, {@link ColumnLayout} decides the page's column
 * structure, {@link TableFinder} and {@link TableGrid} find and resolve its tables, {@link
 * ParagraphAssembler} renders the prose, and {@link PageStitcher} joins what a page break split.
 */
@Slf4j
@Service
@Primary
public class AdvancedPdfMarkdownConverter implements PdfMarkdownExtractor {

    @Override
    public String convert(PdfDocument doc) throws IOException {
        List<String> rendered = new ArrayList<>();
        for (Object e : buildElements(doc)) {
            rendered.add(e instanceof TableBlock tb ? tb.render() : (String) e);
        }
        return MarkdownText.normaliseHeadingLevels(String.join("\n\n", rendered));
    }

    private List<Object> buildElements(PdfDocument doc) throws IOException {
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
            PageLines page = pageLines(doc, allPageText, pageIndex);
            if (page.lines().isEmpty()) {
                PageImages.emit(doc, pageIndex, output);
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

            PageStitcher.mergeAcrossPageBoundary(output, pageItems);
            output.addAll(pageItems);
            prevPageTrailingTableHeader = PageStitcher.trailingTableHeader(pageItems);
        }

        // Stitch tables split across page breaks; callers decide how to realise the elements.
        return PageStitcher.stitchTables(output);
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
        List<Line> stitched = GlyphStitcher.stitchGlyphs(rawLines);
        List<Float> gutters = ColumnLayout.detectGutters(stitched);
        List<Line> lines = LineMerger.mergeLineFragments(stitched, gutters);
        lines.addAll(FormValues.lines(doc, pageIndex, lines));
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
                                .anyMatch(
                                        l ->
                                                MarkdownText.normaliseSpace(l.text)
                                                        .equals(continuationHeader));

        // Merging widens lines, so re-check the pre-repair verdict here: ordering by a gutter the
        // finished lines no longer respect is worse than not splitting at all.
        List<Float> gutters = tableContinuation ? List.of() : page.gutters();
        boolean twoColumn = !gutters.isEmpty();
        boolean respected = twoColumn && ColumnLayout.gutterRespected(lines, gutters);

        // Two detectors: ruling lines give exact boundaries and see single-word cells; the word
        // grid covers what the rules do not, i.e. borderless and whitespace-aligned tables.
        Set<String> tableRowTexts = new HashSet<>();
        PageRules rules = readRules(doc, pageIndex);
        List<TableBlock> blocks = TableFinder.find(lines, rules, pageIndex + 1);
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
                        TableShape.looksLikeGrid(b),
                        TableShape.spansPage(b, lines),
                        TableShape.ownsItsBand(b, lines));
                for (List<Line> row : b.rows()) {
                    log.debug("  row: {}", PageStitcher.rowText(row));
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
                                            (b.ruled() || TableShape.looksLikeGrid(b))
                                                    && (TableShape.spansPage(b, lines)
                                                            || (b.ruled()
                                                                    && TableShape.ownsItsBand(
                                                                            b, lines))))
                            .toList();
        }
        Set<Line> tableLines = new HashSet<>();
        for (TableBlock b : blocks) {
            for (List<Line> row : b.rows()) {
                for (Line l : row) {
                    tableLines.add(l);
                    tableRowTexts.add(MarkdownText.repairHyphens(l.text).strip());
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
                        respected
                                ? ColumnLayout.orderByBand(segments.get(s), gutters)
                                : ColumnLayout.legacySplit(segments.get(s));
                for (List<Line> col : groups) {
                    List<String> paras = new ArrayList<>();
                    ParagraphAssembler.assembleParagraphs(
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
                ParagraphAssembler.assembleParagraphs(
                        segments.get(s), medianSize, medianHeight, bodyFont, paras, tableRowTexts);
                pageItems.addAll(paras);
                if (s < blocks.size()) {
                    pageItems.add(blocks.get(s));
                }
            }
        }

        PageImages.emit(doc, pageIndex, pageItems);
        return pageItems;
    }

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

    /** Ruling lines of one page, or {@link PageRules#EMPTY} if the page cannot be opened. */
    private static PageRules readRules(PdfDocument doc, int pageIndex) {
        try (PdfPage page = doc.page(pageIndex)) {
            return PageRules.of(page);
        } catch (Exception e) {
            return PageRules.EMPTY;
        }
    }
}
