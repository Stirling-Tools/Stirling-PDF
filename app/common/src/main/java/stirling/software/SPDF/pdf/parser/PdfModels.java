package stirling.software.SPDF.pdf.parser;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.apache.pdfbox.pdmodel.PDDocument;

/**
 * All PDF parser model types and the table-parser contract in one place.
 *
 * <p>Import as {@code import static stirling.software.SPDF.pdf.parser.PdfModels.*;} to use all
 * nested types without qualification.
 */
public final class PdfModels {

    private PdfModels() {}

    // ── Geometry ──────────────────────────────────────────────────────────────

    public record Bounds(float x, float y, float width, float height) {

        public float right() {
            return x + width;
        }

        public float bottom() {
            return y + height;
        }

        public static Bounds merge(Bounds a, Bounds b) {
            float x = Math.min(a.x, b.x);
            float y = Math.min(a.y, b.y);
            return new Bounds(
                    x, y, Math.max(a.right(), b.right()) - x, Math.max(a.bottom(), b.bottom()) - y);
        }
    }

    // ── Text fragments and lines ──────────────────────────────────────────────

    /**
     * A contiguous run of text from a single PDF content-stream string operation. {@code baseline}
     * is preserved separately from bounds for line-grouping — characters of different sizes on the
     * same visual line share a baseline but differ in top Y.
     */
    public record TextFragment(
            String fragmentId,
            String text,
            Bounds bounds,
            float baseline,
            float fontSize,
            String fontName,
            boolean bold) {}

    public record RawLine(
            String lineId, List<TextFragment> fragments, Bounds bounds, int pageNumber) {

        public String text() {
            if (fragments.isEmpty()) return "";
            StringBuilder sb = new StringBuilder();
            TextFragment prev = null;
            for (TextFragment f : fragments) {
                if (prev != null) {
                    float gap = f.bounds().x() - prev.bounds().right();
                    float avgCharWidth = prev.bounds().width() / Math.max(prev.text().length(), 1);
                    if (gap > avgCharWidth * 0.5f) sb.append(' ');
                }
                sb.append(f.text());
                prev = f;
            }
            return sb.toString();
        }

        public float dominantFontSize() {
            return fragments.stream()
                    .collect(Collectors.groupingBy(TextFragment::fontSize, Collectors.counting()))
                    .entrySet()
                    .stream()
                    .max(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey)
                    .orElse(0f);
        }

        public boolean hasBold() {
            return fragments.stream().anyMatch(TextFragment::bold);
        }
    }

    public record RawPage(int pageNumber, float widthPt, float heightPt, List<RawLine> lines) {}

    // ── Table model ───────────────────────────────────────────────────────────

    /**
     * A single cell within a {@link TableRow}. {@code colSpan} and {@code rowSpan} are always 1 in
     * v1 — span detection is deferred but the fields keep the schema stable.
     */
    public record TableCell(int colIndex, String text, Bounds bounds, int colSpan, int rowSpan) {

        public static TableCell of(int colIndex, String text, Bounds bounds) {
            return new TableCell(colIndex, text, bounds, 1, 1);
        }
    }

    public record TableRow(int rowIndex, List<TableCell> cells) {}

    /**
     * A table as it appears on a single page. {@code headers} is empty in v1 — all rows are in
     * {@code rows}. {@code rawRows} preserves exact Tabula text output for diagnostics. {@code
     * confidence} is a heuristic score in [0.0, 1.0]. {@code continuedFromPage} is null in v1.
     */
    public record TableFragment(
            String tableId,
            int pageNumber,
            Bounds bounds,
            List<TableRow> headers,
            List<TableRow> rows,
            List<List<String>> rawRows,
            int columnCount,
            float confidence,
            List<String> warnings,
            Integer continuedFromPage) {}

    // ── Page output ───────────────────────────────────────────────────────────

    public record ParsedPage(
            int pageNumber,
            float widthPt,
            float heightPt,
            List<TableFragment> tables,
            List<RawLine> layoutLines) {}

    // ── Parser contract ───────────────────────────────────────────────────────

    /**
     * Extracts tables from a single page of a PDF. The caller owns the document lifecycle;
     * implementations must not close it.
     */
    public interface TableParser {

        /**
         * @param document open PDF; must not be closed by the implementation
         * @param rawPage page metadata and lines for the page to process
         * @return zero or more table fragments found on the page, never null
         */
        List<TableFragment> parse(PDDocument document, RawPage rawPage) throws IOException;
    }
}
