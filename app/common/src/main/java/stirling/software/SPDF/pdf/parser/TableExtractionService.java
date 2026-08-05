package stirling.software.SPDF.pdf.parser;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.pdf.parser.PdfModels.TableFragment;
import stirling.software.common.pdf.PdfMarkdownConverter;
import stirling.software.common.util.JpdfiumGuard;
import stirling.software.jpdfium.PdfDocument;

/**
 * Extracts tables per page: Tabula lattice mode is the most faithful on ruled tables but blind to
 * borderless ones, so pages it misses fall back to {@link PdfMarkdownConverter}'s word grid.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class TableExtractionService {

    private final TabulaTableParser tabulaTableParser;

    /** Which detector produced a table, for logging and for callers that want to report it. */
    public enum Strategy {
        /** Tabula lattice mode: derived from ruling lines. */
        RULED,
        /** Word-grid detection: derived from whitespace column alignment. */
        WORD_GRID
    }

    /** A single extracted table. {@code pageNumber} is 1-based. */
    public record PageTable(int pageNumber, List<List<String>> rows, Strategy strategy) {}

    /**
     * Extracts tables from the requested pages.
     *
     * @param document open PDF, used for ruled-line extraction
     * @param pages 1-based page numbers to extract
     * @param pdfPath path to the same PDF on disk, used for the word-grid fallback; when {@code
     *     null} only ruled extraction runs
     * @return tables in page order, empty when the document genuinely has none
     */
    public List<PageTable> extract(PDDocument document, Collection<Integer> pages, Path pdfPath)
            throws IOException {
        List<PageTable> results = new ArrayList<>();
        Set<Integer> pagesWithoutRuledTables = new LinkedHashSet<>();

        for (int pageNum : pages) {
            List<TableFragment> fragments = tabulaTableParser.parse(document, pageNum);
            if (fragments.isEmpty()) {
                pagesWithoutRuledTables.add(pageNum);
                continue;
            }
            for (TableFragment fragment : fragments) {
                results.add(new PageTable(pageNum, fragment.rawRows(), Strategy.RULED));
            }
        }

        if (pagesWithoutRuledTables.isEmpty() || pdfPath == null) {
            return sortedByPage(results);
        }

        for (PageTable t : wordGridTables(pdfPath, pagesWithoutRuledTables)) {
            results.add(t);
        }
        return sortedByPage(results);
    }

    /**
     * Word-grid tables restricted to the given pages. Layout analysis is costly and runs under the
     * process-wide jpdfium lock, so analysing unrequested pages would block every other caller.
     */
    private List<PageTable> wordGridTables(Path pdfPath, Set<Integer> wantedPages) {
        List<PageTable> out = new ArrayList<>();
        try (JpdfiumGuard.Scope guard = JpdfiumGuard.acquire();
                PdfDocument doc = PdfDocument.open(pdfPath)) {
            for (PdfMarkdownConverter.ExtractedTable t :
                    new PdfMarkdownConverter().extractTables(doc, wantedPages)) {
                if (wantedPages.contains(t.pageNumber()) && !t.rows().isEmpty()) {
                    out.add(new PageTable(t.pageNumber(), t.rows(), Strategy.WORD_GRID));
                }
            }
            if (!out.isEmpty()) {
                log.debug(
                        "Word-grid fallback recovered {} table(s) on pages with no ruling lines",
                        out.size());
            }
        } catch (Exception e) {
            // Best-effort: the caller still has the ruled results. Logged with the throwable so a
            // converter bug is diagnosable rather than reading as "no tables".
            log.warn("Word-grid table fallback failed for {}", pdfPath.getFileName(), e);
        }
        return out;
    }

    private static List<PageTable> sortedByPage(List<PageTable> tables) {
        tables.sort((a, b) -> Integer.compare(a.pageNumber(), b.pageNumber()));
        return tables;
    }
}
