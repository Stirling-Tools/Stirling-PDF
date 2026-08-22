package stirling.software.common.pdf;

import java.io.IOException;

import stirling.software.jpdfium.PdfDocument;

/**
 * Seam for PDF to Markdown conversion. {@link BasicPdfMarkdownExtractor} is the built-in
 * implementation; the proprietary module supplies a layout-aware one that takes precedence when it
 * is on the classpath.
 */
public interface PdfMarkdownExtractor {

    String convert(PdfDocument doc) throws IOException;
}
