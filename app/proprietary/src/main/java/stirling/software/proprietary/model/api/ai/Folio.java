package stirling.software.proprietary.model.api.ai;

import java.util.List;

/**
 * One page's worth of extracted content, assembled by Java in response to a {@link Requisition}.
 *
 * <p>Only the fields explicitly requested will be populated; unused fields are {@code null}.
 *
 * @param page 0-indexed page number.
 * @param text PDFBox plain-text extraction result (null if not requested).
 * @param tables Tabula CSV strings, one per table found on the page (null if not requested).
 * @param ocrText OCRmyPDF output text (null if not requested or OCR not available).
 * @param ocrConfidence Mean character confidence from OCRmyPDF, 0.0–1.0 (null if OCR not run).
 */
public record Folio(
        int page, String text, List<String> tables, String ocrText, Double ocrConfidence) {}
