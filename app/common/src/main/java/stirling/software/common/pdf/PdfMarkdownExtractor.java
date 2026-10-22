package stirling.software.common.pdf;

import java.io.IOException;
import java.util.List;

import stirling.software.jpdfium.PdfDocument;

/**
 * Seam for PDF to Markdown conversion. The proprietary module supplies a layout-aware
 * implementation that takes precedence on the classpath.
 */
public interface PdfMarkdownExtractor {

    /** Page-attributed Markdown elements in reading order; the one source of truth. */
    List<MarkdownBlock> extractBlocks(PdfDocument doc) throws IOException;

    default String convert(PdfDocument doc) throws IOException {
        return MarkdownBlocks.join(extractBlocks(doc));
    }
}
