package stirling.software.SPDF.pdf.parser;

import static stirling.software.SPDF.pdf.parser.PdfModels.*;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Chains table parsers in priority order: Tabula lattice → Tabula stream → {@link
 * LineAlignmentTableParser}. The first parser returning a result above {@link
 * #TABULA_CONFIDENCE_THRESHOLD} wins; results from different parsers are never mixed on one page.
 */
@Service
@Primary
@RequiredArgsConstructor
@Slf4j
public class CompositeTableParser implements TableParser {

    /** Min Tabula confidence to accept results; below this LineAlignment is tried instead. */
    static final float TABULA_CONFIDENCE_THRESHOLD = 0.5f;

    private final TabulaTableParser tabulaParser;
    private final LineAlignmentTableParser lineAlignmentParser;

    @Override
    public List<TableFragment> parse(PDDocument document, RawPage rawPage) throws IOException {
        // Step 1: Tabula lattice mode (ruled/bordered tables).
        List<TableFragment> latticeResults = filterConfident(tabulaParser.parse(document, rawPage));
        if (!latticeResults.isEmpty()) {
            log.debug(
                    "Page {}: using Tabula lattice ({} table(s))",
                    rawPage.pageNumber(),
                    latticeResults.size());
            return latticeResults;
        }

        // Step 2: Tabula stream mode (borderless/whitespace-delimited tables).
        // parseStream is not on the TableParser interface — this intentionally couples to the
        // concrete TabulaTableParser since stream mode is a Tabula-specific concept.
        List<TableFragment> streamResults =
                filterConfident(tabulaParser.parseStream(document, rawPage));
        if (!streamResults.isEmpty()) {
            log.debug(
                    "Page {}: using Tabula stream ({} table(s))",
                    rawPage.pageNumber(),
                    streamResults.size());
            return streamResults;
        }

        // Step 3: Geometry-based line-alignment fallback.
        List<TableFragment> lineResults = lineAlignmentParser.parse(document, rawPage);
        if (!lineResults.isEmpty()) {
            log.debug(
                    "Page {}: using LineAlignment ({} table(s))",
                    rawPage.pageNumber(),
                    lineResults.size());
            return lineResults;
        }

        return List.of();
    }

    private List<TableFragment> filterConfident(List<TableFragment> tables) {
        return tables.stream().filter(t -> t.confidence() >= TABULA_CONFIDENCE_THRESHOLD).toList();
    }
}
