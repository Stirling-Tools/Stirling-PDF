package stirling.software.proprietary.pdf.parser;

import static stirling.software.proprietary.pdf.parser.PdfModels.*;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Runs the per-page ingestion pipeline: {@link WordExtractingStripper} → {@link LineBuilder} →
 * {@link TableParser}, producing a {@link PdfModels.ParsedPage} per page. The caller owns the
 * {@link PDDocument} lifecycle.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PdfIngester {

    private final LineBuilder lineBuilder;
    private final TableParser tableParser;

    public List<ParsedPage> parse(PDDocument document) throws IOException {
        int pageCount = document.getNumberOfPages();
        List<ParsedPage> pages = new ArrayList<>(pageCount);
        long fragmentsMs = 0;
        long tablesMs = 0;
        long t0 = System.currentTimeMillis();

        for (int p = 1; p <= pageCount; p++) {
            long ft = System.currentTimeMillis();
            List<TextFragment> fragments = extractFragments(document, p);
            fragmentsMs += System.currentTimeMillis() - ft;

            PDPage page = document.getPage(p - 1);
            PDRectangle mediaBox = page.getMediaBox();
            List<RawLine> lines = lineBuilder.build(fragments, p);
            RawPage rawPage = new RawPage(p, mediaBox.getWidth(), mediaBox.getHeight(), lines);

            long tt = System.currentTimeMillis();
            List<TableFragment> tables = tableParser.parse(document, rawPage);
            tablesMs += System.currentTimeMillis() - tt;

            log.debug(
                    "Page {}: {} fragments → {} lines, {} table(s)",
                    p,
                    fragments.size(),
                    lines.size(),
                    tables.size());
            pages.add(new ParsedPage(p, mediaBox.getWidth(), mediaBox.getHeight(), tables, lines));
        }

        log.info(
                "[timing] parse pages={} total={}ms fragments={}ms tables={}ms",
                pageCount,
                System.currentTimeMillis() - t0,
                fragmentsMs,
                tablesMs);
        return pages;
    }

    private List<TextFragment> extractFragments(PDDocument document, int pageNumber)
            throws IOException {
        WordExtractingStripper stripper = new WordExtractingStripper(pageNumber);
        stripper.getText(document);
        return stripper.getFragments();
    }
}
