package stirling.software.common.pdf;

import java.io.IOException;
import java.util.List;

import org.springframework.stereotype.Service;

import stirling.software.jpdfium.PdfDocument;

/** Built-in Markdown conversion, used whenever no richer extractor is registered. */
@Service
public class BasicPdfMarkdownExtractor implements PdfMarkdownExtractor {

    @Override
    public List<MarkdownBlock> extractBlocks(PdfDocument doc) throws IOException {
        return new PdfMarkdownConverter().extractBlocks(doc);
    }
}
