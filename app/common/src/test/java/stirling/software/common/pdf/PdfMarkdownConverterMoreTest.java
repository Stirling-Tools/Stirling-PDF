package stirling.software.common.pdf;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.text.PageText;
import stirling.software.jpdfium.text.Table;
import stirling.software.jpdfium.text.TextChar;
import stirling.software.jpdfium.text.TextLine;
import stirling.software.jpdfium.text.TextWord;

/**
 * Gap-filling tests for {@link PdfMarkdownConverter} not covered by {@link
 * PdfMarkdownConverterTest}: the visible-for-testing column-range detector across a range of
 * geometries, the package-private extraction helpers, and the full conversion of the wrapped-cell
 * fixture (only run under a disabled accuracy test in the sibling suite).
 */
class PdfMarkdownConverterMoreTest {

    @TempDir Path tmp;

    // ---- helpers ------------------------------------------------------------

    /** A word occupying [x, x+width] on baseline y; chars are synthetic so text length is real. */
    private static TextWord word(String text, float x, float width) {
        List<TextChar> chars = new ArrayList<>();
        for (int i = 0; i < text.length(); i++) {
            chars.add(
                    new TextChar(
                            i,
                            text.charAt(i),
                            x,
                            0f,
                            width / Math.max(1, text.length()),
                            10f,
                            "Helvetica",
                            10f));
        }
        return new TextWord(chars, x, 0f, width, 10f);
    }

    /** A single-line row built from the given words, spanning their full x-range. */
    private static TextLine row(float y, TextWord... words) {
        float minX = Float.MAX_VALUE;
        float maxX = -Float.MAX_VALUE;
        for (TextWord w : words) {
            minX = Math.min(minX, w.x());
            maxX = Math.max(maxX, w.x() + w.width());
        }
        return new TextLine(List.of(words), minX, y, maxX - minX, 10f);
    }

    /** Copies a classpath fixture into the temp dir and returns its path. */
    private Path fixture(String name) throws IOException {
        Path dest = tmp.resolve(name);
        try (InputStream in = getClass().getResourceAsStream("/pdf-ingestion-fixtures/" + name)) {
            assertThat(in).as("fixture on classpath: " + name).isNotNull();
            Files.copy(in, dest);
        }
        return dest;
    }

    // ---- findColumnRangesFromLines -----------------------------------------

    @Nested
    @DisplayName("findColumnRangesFromLines")
    class ColumnRanges {

        @Test
        @DisplayName("two well-separated bands are detected as two columns")
        void twoColumns() {
            List<TextLine> rows = new ArrayList<>();
            for (int r = 0; r < 4; r++) {
                float y = 400f - r * 12f;
                rows.add(row(y, word("left", 50f, 40f), word("right", 190f, 40f)));
            }
            List<float[]> cols = PdfMarkdownConverter.findColumnRangesFromLines(rows);
            assertThat(cols).hasSize(2);
            // First band starts near 50, second near 190.
            assertThat(cols.get(0)[0]).isLessThan(cols.get(1)[0]);
        }

        @Test
        @DisplayName("two bands within a narrow gutter merge into one column")
        void narrowGutterMerges() {
            List<TextLine> rows = new ArrayList<>();
            for (int r = 0; r < 4; r++) {
                float y = 400f - r * 12f;
                // Gap of ~10pt is far below the merge threshold for 40pt-wide words.
                rows.add(row(y, word("aa", 50f, 40f), word("bb", 100f, 40f)));
            }
            List<float[]> cols = PdfMarkdownConverter.findColumnRangesFromLines(rows);
            assertThat(cols).hasSize(1);
        }

        @Test
        @DisplayName("a single occupied band yields one column (trailing-band flush)")
        void singleColumn() {
            List<TextLine> rows = new ArrayList<>();
            for (int r = 0; r < 3; r++) {
                rows.add(row(400f - r * 12f, word("word", 50f, 60f)));
            }
            List<float[]> cols = PdfMarkdownConverter.findColumnRangesFromLines(rows);
            assertThat(cols).hasSize(1);
            assertThat(cols.get(0)[0]).isCloseTo(50f, org.assertj.core.api.Assertions.within(2f));
        }

        @Test
        @DisplayName("rows with no words produce no columns")
        void noWordsNoColumns() {
            List<TextLine> rows = new ArrayList<>();
            for (int r = 0; r < 3; r++) {
                rows.add(new TextLine(List.of(), 0f, 400f - r * 12f, 0f, 10f));
            }
            assertThat(PdfMarkdownConverter.findColumnRangesFromLines(rows)).isEmpty();
        }

        @Test
        @DisplayName("an empty row list produces no columns")
        void emptyInput() {
            assertThat(PdfMarkdownConverter.findColumnRangesFromLines(List.of())).isEmpty();
        }

        @Test
        @DisplayName("a sparsely-covered band below the support threshold is dropped")
        void sparseBandDropped() {
            // Five rows fill the left band; only one fills a far-right band, which is below the
            // 35%-of-rows support floor and so is not reported as a column.
            List<TextLine> rows = new ArrayList<>();
            for (int r = 0; r < 5; r++) {
                rows.add(row(400f - r * 12f, word("left", 50f, 40f)));
            }
            rows.add(row(320f, word("left", 50f, 40f), word("rareoutlier", 400f, 60f)));
            List<float[]> cols = PdfMarkdownConverter.findColumnRangesFromLines(rows);
            assertThat(cols).hasSize(1);
        }
    }

    // ---- package-private extraction helpers ---------------------------------

    @Nested
    @DisplayName("extraction helpers")
    class ExtractionHelpers {

        @Test
        @DisplayName("extractAllPageText returns one PageText per page")
        void extractAllPageText() throws IOException {
            Path pdf = fixture("bordered-table-test_widget.pdf");
            try (PdfDocument doc = PdfDocument.open(pdf)) {
                List<PageText> pages = new PdfMarkdownConverter().extractAllPageText(doc);
                assertThat(pages).isNotNull();
                assertThat(pages).hasSize(doc.pageCount());
            }
        }

        @Test
        @DisplayName("extractTables returns a non-null list for the first page")
        void extractTables() throws IOException {
            Path pdf = fixture("bordered-table-test_widget.pdf");
            try (PdfDocument doc = PdfDocument.open(pdf)) {
                List<Table> tables = new PdfMarkdownConverter().extractTables(doc, 0);
                assertThat(tables).isNotNull();
            }
        }

        @Test
        @DisplayName("renderTables maps each extracted table to a markdown string")
        void renderTables() throws IOException {
            Path pdf = fixture("bordered-table-test_widget.pdf");
            PdfMarkdownConverter converter = new PdfMarkdownConverter();
            try (PdfDocument doc = PdfDocument.open(pdf)) {
                List<Table> tables = converter.extractTables(doc, 0);
                List<String> rendered = converter.renderTables(tables);
                assertThat(rendered).isNotNull();
                assertThat(rendered).hasSameSizeAs(tables);
            }
        }

        @Test
        @DisplayName("renderTables on an empty table list returns an empty list")
        void renderTablesEmpty() {
            assertThat(new PdfMarkdownConverter().renderTables(List.of())).isEmpty();
        }
    }

    // ---- full conversion of additional fixtures -----------------------------

    @Nested
    @DisplayName("convert full pipeline")
    class ConvertPipeline {

        @Test
        @DisplayName("wrapped-cell expense report converts without throwing and yields content")
        void wrappedCellFixture() throws IOException {
            Path pdf = fixture("wrapped-cell-test_expense-report.pdf");
            String md;
            try (PdfDocument doc = PdfDocument.open(pdf)) {
                md = new PdfMarkdownConverter().convert(doc);
            }
            assertThat(md).isNotNull();
            assertThat(md).isNotBlank();
        }

        @Test
        @DisplayName("converting a fixture twice is deterministic")
        void deterministic() throws IOException {
            Path pdf = fixture("multi-column-test_lorem.pdf");
            String first;
            String second;
            try (PdfDocument doc = PdfDocument.open(pdf)) {
                first = new PdfMarkdownConverter().convert(doc);
            }
            try (PdfDocument doc = PdfDocument.open(pdf)) {
                second = new PdfMarkdownConverter().convert(doc);
            }
            assertThat(first).isEqualTo(second);
        }

        @Test
        @DisplayName("the many-tables stress fixture converts without throwing")
        void manyTablesFixture() throws IOException {
            Path pdf = fixture("many-tables-test_stress.pdf");
            assertDoesNotThrow(
                    () -> {
                        try (PdfDocument doc = PdfDocument.open(pdf)) {
                            return new PdfMarkdownConverter().convert(doc);
                        }
                    });
        }
    }
}
