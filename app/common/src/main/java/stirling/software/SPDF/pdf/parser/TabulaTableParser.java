package stirling.software.SPDF.pdf.parser;

import static stirling.software.SPDF.pdf.parser.PdfModels.*;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import technology.tabula.ObjectExtractor;
import technology.tabula.Page;
import technology.tabula.RectangularTextContainer;
import technology.tabula.Table;
import technology.tabula.extractors.BasicExtractionAlgorithm;
import technology.tabula.extractors.ExtractionAlgorithm;
import technology.tabula.extractors.SpreadsheetExtractionAlgorithm;

/**
 * Primary {@link TableParser} implementation using Tabula's lattice-mode extraction.
 *
 * <h3>Algorithm</h3>
 *
 * Uses {@link SpreadsheetExtractionAlgorithm} (lattice mode), which detects tables from ruled lines
 * (horizontal and vertical PDF path operators). This is reliable for tables with visible borders.
 * Borderless or whitespace-delimited tables will not be detected — that requires stream mode, which
 * is deferred to a later iteration.
 *
 * <h3>Coordinate system</h3>
 *
 * Tabula normalises page coordinates so that (0,0) is the top-left corner and Y increases downward,
 * matching the {@link Bounds} convention used throughout this parser. No coordinate transformation
 * is needed when mapping Tabula cell bounds to {@link Bounds}.
 *
 * <h3>Known limitations</h3>
 *
 * <ul>
 *   <li>Borderless tables are not detected (use stream mode, deferred).
 *   <li>Colspan and rowspan are not detected; all cells report colSpan=1, rowSpan=1.
 *   <li>Header rows are not identified; all rows appear in {@code rows}, headers is empty.
 *   <li>Cross-page table linking is not performed; each page is independent.
 *   <li>Rotated tables (90°/270° pages) may produce incorrect bounds.
 * </ul>
 */
@Service
@Slf4j
public class TabulaTableParser implements TableParser {

    /** Lattice mode — reliable for tables with visible ruled borders. */
    @Override
    public List<TableFragment> parse(PDDocument document, RawPage rawPage) throws IOException {
        return parseWithAlgorithm(
                document, rawPage, new SpreadsheetExtractionAlgorithm(), "lattice");
    }

    /**
     * Convenience overload for callers that only have a page number, not a full {@link RawPage}.
     */
    public List<TableFragment> parse(PDDocument document, int pageNumber) throws IOException {
        return parse(document, new RawPage(pageNumber, 0f, 0f, List.of()));
    }

    /** Stream mode — whitespace-based column detection for borderless tables. */
    public List<TableFragment> parseStream(PDDocument document, RawPage rawPage)
            throws IOException {
        return parseWithAlgorithm(document, rawPage, new BasicExtractionAlgorithm(), "stream");
    }

    private List<TableFragment> parseWithAlgorithm(
            PDDocument document, RawPage rawPage, ExtractionAlgorithm algorithm, String modeName)
            throws IOException {
        int pageNumber = rawPage.pageNumber();

        List<Table> tabulaTables;
        try {
            // Do NOT use try-with-resources: ObjectExtractor.close() closes the underlying
            // PDDocument, which we don't own. The extractor holds no resources of its own.
            ObjectExtractor extractor = new ObjectExtractor(document);
            Page page = extractor.extract(pageNumber);
            tabulaTables = new ArrayList<>(algorithm.extract(page));
        } catch (Exception e) {
            log.warn(
                    "Tabula {} extraction failed on page {}: {}",
                    modeName,
                    pageNumber,
                    e.getMessage());
            return List.of();
        }

        if (tabulaTables.isEmpty()) {
            log.debug("Page {}: no tables detected by Tabula ({})", pageNumber, modeName);
            return List.of();
        }

        log.debug(
                "Page {}: Tabula ({}) detected {} table(s)",
                pageNumber,
                modeName,
                tabulaTables.size());

        List<TableFragment> fragments = new ArrayList<>(tabulaTables.size());
        for (int i = 0; i < tabulaTables.size(); i++) {
            fragments.add(toFragment(tabulaTables.get(i), pageNumber, i));
        }
        return fragments;
    }

    // ── private helpers ──────────────────────────────────────────────────────────────────────────

    private TableFragment toFragment(Table table, int pageNumber, int tableIndex) {
        List<List<RectangularTextContainer>> tabulaRows = table.getRows();
        List<String> warnings = new ArrayList<>();

        List<List<String>> rawRows = buildRawRows(tabulaRows);
        int colCount = inferColumnCount(rawRows, warnings);
        List<TableRow> rows = buildRows(tabulaRows, colCount, warnings);
        float confidence = computeConfidence(rawRows, colCount, warnings);
        Bounds bounds = tableBounds(table);

        String tableId = "tbl-p" + pageNumber + "-" + tableIndex;

        if (!warnings.isEmpty()) {
            log.warn("Page {}, table {}: {}", pageNumber, tableIndex, warnings);
        }

        return new TableFragment(
                tableId,
                pageNumber,
                bounds,
                List.of(), // headers: deferred to v2
                rows,
                rawRows,
                colCount,
                confidence,
                Collections.unmodifiableList(warnings),
                null); // continuedFromPage: deferred to v2
    }

    private List<List<String>> buildRawRows(List<List<RectangularTextContainer>> tabulaRows) {
        List<List<String>> rawRows = new ArrayList<>(tabulaRows.size());
        for (List<RectangularTextContainer> tabulaRow : tabulaRows) {
            List<String> cells = new ArrayList<>(tabulaRow.size());
            for (RectangularTextContainer cell : tabulaRow) {
                cells.add(normaliseText(cell.getText()));
            }
            rawRows.add(Collections.unmodifiableList(cells));
        }
        return rawRows;
    }

    private List<TableRow> buildRows(
            List<List<RectangularTextContainer>> tabulaRows, int colCount, List<String> warnings) {
        List<TableRow> rows = new ArrayList<>(tabulaRows.size());
        for (int rowIdx = 0; rowIdx < tabulaRows.size(); rowIdx++) {
            List<RectangularTextContainer> tabulaRow = tabulaRows.get(rowIdx);
            List<TableCell> cells = new ArrayList<>(tabulaRow.size());

            for (int colIdx = 0; colIdx < tabulaRow.size(); colIdx++) {
                RectangularTextContainer c = tabulaRow.get(colIdx);
                Bounds cellBounds =
                        new Bounds(
                                (float) c.getX(),
                                (float) c.getY(),
                                (float) c.getWidth(),
                                (float) c.getHeight());
                cells.add(TableCell.of(colIdx, normaliseText(c.getText()), cellBounds));
            }

            if (tabulaRow.size() != colCount) {
                warnings.add(
                        "Row "
                                + rowIdx
                                + " has "
                                + tabulaRow.size()
                                + " cells; expected "
                                + colCount);
            }

            rows.add(new TableRow(rowIdx, Collections.unmodifiableList(cells)));
        }
        return rows;
    }

    /**
     * The canonical column count for a table is the size of the widest row. Tabula can produce
     * uneven rows when a cell's ruling lines are partially missing.
     */
    private int inferColumnCount(List<List<String>> rawRows, List<String> warnings) {
        if (rawRows.isEmpty()) return 0;
        int max = rawRows.stream().mapToInt(List::size).max().orElse(0);
        int mode =
                rawRows.stream()
                        .collect(
                                java.util.stream.Collectors.groupingBy(
                                        List::size, java.util.stream.Collectors.counting()))
                        .entrySet()
                        .stream()
                        .max(java.util.Map.Entry.comparingByValue())
                        .map(java.util.Map.Entry::getKey)
                        .orElse(0);
        if (max != mode) {
            warnings.add("Inconsistent column count: modal=" + mode + " max=" + max);
        }
        return mode > 0 ? mode : max;
    }

    /**
     * Heuristic confidence score in [0.0, 1.0].
     *
     * <ul>
     *   <li>Starts at 1.0.
     *   <li>-0.3 if only one column (single-column tables are usually not real tables).
     *   <li>-0.1 per row with an inconsistent column count, capped at -0.4.
     *   <li>-0.3 if the empty-cell ratio across all cells exceeds 80%.
     * </ul>
     */
    private float computeConfidence(
            List<List<String>> rawRows, int colCount, List<String> warnings) {
        if (rawRows.isEmpty() || colCount == 0) return 0f;

        float score = 1.0f;

        if (colCount == 1) score -= 0.3f;

        long inconsistentRows = rawRows.stream().filter(r -> r.size() != colCount).count();
        score -= Math.min(inconsistentRows * 0.1f, 0.4f);

        long totalCells = rawRows.stream().mapToLong(List::size).sum();
        long emptyCells =
                rawRows.stream().flatMap(Collection::stream).filter(String::isBlank).count();
        if (totalCells > 0 && (float) emptyCells / totalCells > 0.8f) {
            score -= 0.3f;
        }

        return Math.max(0f, Math.min(1f, score));
    }

    private Bounds tableBounds(Table table) {
        return new Bounds(
                (float) table.getX(),
                (float) table.getY(),
                (float) table.getWidth(),
                (float) table.getHeight());
    }

    private String normaliseText(String raw) {
        if (raw == null) return "";
        // Tabula wraps multi-line cell content with \r\n — collapse to a single space.
        return raw.replace("\r\n", " ").replace("\n", " ").replace("\r", " ").trim();
    }
}
