package stirling.software.SPDF.service.pdf.impl;

import java.util.List;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.pdf.PdfiumService;

/**
 * No-op fallback when {@code libpdfium.so} is not available at runtime.
 *
 * <p>All operations return safe defaults (original bytes or empty arrays). The existing PDFBox path
 * in {@code RedactController} handles cosmetic box+flatten redaction as the fallback strategy.
 */
@Slf4j
public class NoOpPdfiumService implements PdfiumService {

    public NoOpPdfiumService() {
        log.warn("[PDFium] libpdfium not found — native operations disabled.");
    }

    @Override
    public boolean isAvailable() {
        return false;
    }

    @Override
    public byte[] autoRedact(
            byte[] pdfBytes,
            List<String> patterns,
            boolean useRegex,
            boolean caseSensitive,
            int redactColor) {
        log.warn("[PDFium] autoRedact unavailable — returning original.");
        return pdfBytes;
    }

    @Override
    public byte[] renderPageToRgb(byte[] pdfBytes, int pageIndex, int dpi) {
        return new byte[0];
    }
}
