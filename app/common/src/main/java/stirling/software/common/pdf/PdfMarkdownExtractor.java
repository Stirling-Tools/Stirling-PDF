package stirling.software.common.pdf;

import java.io.IOException;

import stirling.software.jpdfium.PdfDocument;

/**
 * Seam for PDF to Markdown conversion. The proprietary module supplies a layout-aware
 * implementation that takes precedence on the classpath.
 */
public interface PdfMarkdownExtractor {

    String convert(PdfDocument doc) throws IOException;
}
