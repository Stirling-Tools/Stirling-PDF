package stirling.software.SPDF.pdf.parser;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.SPDF.pdf.parser.PdfModels.Bounds;
import stirling.software.SPDF.pdf.parser.PdfModels.TableFragment;
import stirling.software.SPDF.pdf.parser.TableExtractionService.PageTable;
import stirling.software.SPDF.pdf.parser.TableExtractionService.Strategy;
import stirling.software.common.util.JpdfiumGuard;

/**
 * The point of the service is the fallback: ruled extraction wins where it fires, and pages with
 * none get a second chance from word-grid detection.
 */
@ExtendWith(MockitoExtension.class)
class TableExtractionServiceTest {

    @Mock private TabulaTableParser tabulaTableParser;

    @TempDir Path tmp;

    private static PDDocument docWithPages(int pages) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pages; i++) {
            doc.addPage(new PDPage());
        }
        return doc;
    }

    private static TableFragment fragment(List<List<String>> rows) {
        return new TableFragment(
                "tbl",
                1,
                new Bounds(0f, 0f, 100f, 100f),
                List.of(),
                List.of(),
                rows,
                rows.isEmpty() ? 0 : rows.get(0).size(),
                1.0f,
                List.of(),
                null);
    }

    /** Tabula is mocked out by the caller, so this fixture always drives the word-grid path. */
    private Path fallbackFixture() throws IOException {
        Path out = tmp.resolve("wrapped-cell-test_expense-report.pdf");
        try (InputStream in =
                getClass()
                        .getResourceAsStream(
                                "/pdf-ingestion-fixtures/wrapped-cell-test_expense-report.pdf")) {
            Files.copy(in, out);
        }
        return out;
    }

    @Test
    @DisplayName("ruled tables are returned as-is and the fallback is not consulted")
    void ruledTablesShortCircuitFallback() throws IOException {
        TableExtractionService svc = new TableExtractionService(tabulaTableParser);
        when(tabulaTableParser.parse(any(PDDocument.class), eq(1)))
                .thenReturn(List.of(fragment(List.of(List.of("a", "b")))));

        List<PageTable> tables;
        try (PDDocument doc = docWithPages(1)) {
            // A null path means the fallback cannot run at all; ruled results must still come back.
            tables = svc.extract(doc, List.of(1), null);
        }

        assertThat(tables).hasSize(1);
        assertThat(tables.get(0).strategy()).isEqualTo(Strategy.RULED);
        assertThat(tables.get(0).rows()).containsExactly(List.of("a", "b"));
    }

    @Test
    @DisplayName("a page with no ruled tables falls back to word-grid detection")
    void fallsBackWhenNoRuledTables() throws IOException {
        TableExtractionService svc = new TableExtractionService(tabulaTableParser);
        when(tabulaTableParser.parse(any(PDDocument.class), eq(1))).thenReturn(List.of());

        List<PageTable> tables;
        try (PDDocument doc = docWithPages(1)) {
            tables = svc.extract(doc, List.of(1), fallbackFixture());
        }

        assertThat(tables).isNotEmpty();
        assertThat(tables).allSatisfy(t -> assertThat(t.strategy()).isEqualTo(Strategy.WORD_GRID));
        verify(tabulaTableParser).parse(any(PDDocument.class), eq(1));
    }

    @Test
    @DisplayName("no tables anywhere yields an empty list rather than an error")
    void noTablesAnywhere() throws IOException {
        TableExtractionService svc = new TableExtractionService(tabulaTableParser);
        when(tabulaTableParser.parse(any(PDDocument.class), eq(1))).thenReturn(List.of());

        List<PageTable> tables;
        try (PDDocument doc = docWithPages(1)) {
            // Not a readable PDF, so the fallback fails; the service must absorb that.
            tables = svc.extract(doc, List.of(1), tmp.resolve("nope.pdf"));
        }

        assertThat(tables).isEmpty();
    }

    @Test
    @DisplayName("a jpdfium lock timeout is raised, not reported as an empty table set")
    void lockTimeoutIsNotSwallowedAsNoTables() throws IOException {
        TableExtractionService svc = new TableExtractionService(tabulaTableParser);
        when(tabulaTableParser.parse(any(PDDocument.class), eq(1))).thenReturn(List.of());
        Path fixture = fallbackFixture();

        try (MockedStatic<JpdfiumGuard> guard = mockStatic(JpdfiumGuard.class);
                PDDocument doc = docWithPages(1)) {
            guard.when(JpdfiumGuard::acquire).thenThrow(JpdfiumGuard.JpdfiumBusyException.class);

            // Silently returning zero tables would hand the caller a 200 with missing data.
            assertThatThrownBy(() -> svc.extract(doc, List.of(1), fixture))
                    .isInstanceOf(JpdfiumGuard.JpdfiumBusyException.class);
        }
    }

    @Test
    @DisplayName("results stay in page order when ruled and fallback tables are mixed")
    void resultsAreOrderedByPage() throws IOException {
        TableExtractionService svc = new TableExtractionService(tabulaTableParser);
        when(tabulaTableParser.parse(any(PDDocument.class), eq(1))).thenReturn(List.of());
        when(tabulaTableParser.parse(any(PDDocument.class), eq(2)))
                .thenReturn(List.of(fragment(List.of(List.of("page2")))));

        List<PageTable> tables;
        try (PDDocument doc = docWithPages(2)) {
            tables = svc.extract(doc, List.of(1, 2), fallbackFixture());
        }

        assertThat(tables).isNotEmpty();
        assertThat(tables).extracting(PageTable::pageNumber).isSorted();
    }
}
