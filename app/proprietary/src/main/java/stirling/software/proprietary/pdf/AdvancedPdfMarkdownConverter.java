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
 * Converts a PDF to Markdown from PDFium {@link TextLine}s. Orchestration only: each stage of the
 * pipeline lives in its own class in this package.
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
        // Tables stay structured until after the page loop so one split across a page break can
        // be stitched back together before rendering.
        List<Object> output = new ArrayList<>();
        // Header of a table that ended the previous page, for spotting a continuation; null if
        // none.
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
     * One page's lines plus its layout verdict, which must be taken before text repair: merging
     * reduces the line count the two-column guard scales with.
     */
    private record PageLines(List<Line> lines, List<Float> gutters) {
        boolean twoColumnLayout() {
            return !gutters.isEmpty();
        }
    }

    /** Assembled lines for one page, sorted top-to-bottom (PDF y=0 is the page bottom). */
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
     * One page's elements: paragraph strings interleaved with {@link TableBlock}s in reading order.
     * {@code continuationHeader} is the previous page's trailing table header, or null.
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
        // Only genuine two-column prose is split: a table's column gutters must not read as a page
        // gutter, and a table continuing from the previous page is not a new two-column layout.
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
                    tableRowTexts.add(l.text.strip());
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
            // Interleave tables with text by vertical position: each block gets a slot,
            // and non-table lines fall into the slot for their y, keeping tables separate.
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
     * holding the lines above block {@code s}. Blocks must be in top-to-bottom order.
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
            log.debug(
                    "Page {} ruling lines unreadable; falling back to word-grid tables",
                    pageIndex,
                    e);
            return PageRules.EMPTY;
        }
    }
}
