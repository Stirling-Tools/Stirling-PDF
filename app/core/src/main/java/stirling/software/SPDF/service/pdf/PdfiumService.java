package stirling.software.SPDF.service.pdf;

import java.util.List;

/**
 * Service interface for PDFium-based PDF operations using Java 25 FFM (Foreign Function & Memory)
 * API.
 *
 * <p>Implementations provide true content-stripping redaction that removes text objects from the
 * PDF content stream, unlike cosmetic box-overlay approaches.
 *
 * <p>If {@code libpdfium.so} is not present at runtime, the {@link
 * stirling.software.SPDF.service.pdf.impl.NoOpPdfiumService NoOpPdfiumService} fallback returns
 * original bytes unchanged.
 */
public interface PdfiumService {

    /**
     * Whether the native PDFium library is loaded and available.
     *
     * @return {@code true} if PDFium operations are functional
     */
    boolean isAvailable();

    /**
     * True content-stripping redaction:
     *
     * <ul>
     *   <li>Finds all matches (literal or regex) on every page
     *   <li>Removes text objects overlapping matched regions
     *   <li>Paints opaque rectangles over redacted areas
     *   <li>Rewrites content stream via {@code FPDFPage_GenerateContent()}
     * </ul>
     *
     * @param pdfBytes source PDF
     * @param patterns list of literal strings or regex patterns
     * @param useRegex if true, treat patterns as Java regex; if false, literal PDFium search
     * @param caseSensitive case-sensitive matching
     * @param redactColor ARGB color for redaction boxes (default 0xFF000000 = opaque black)
     * @return redacted PDF bytes, or original bytes if nothing matched
     */
    byte[] autoRedact(
            byte[] pdfBytes,
            List<String> patterns,
            boolean useRegex,
            boolean caseSensitive,
            int redactColor);

    /**
     * Render a single page to raw RGB pixel data.
     *
     * @param pdfBytes source PDF
     * @param pageIndex zero-based page index
     * @param dpi target resolution in dots per inch
     * @return raw RGB byte array, or empty array if unavailable
     */
    byte[] renderPageToRgb(byte[] pdfBytes, int pageIndex, int dpi);
}
