package stirling.software.proprietary.model.api.ai;

import java.util.List;

/**
 * The Python Examiner's shopping list: which pages Java must extract before the Auditor can form an
 * opinion.
 *
 * <p>Java parses this from the Examiner's response, fulfils it (text / tables / OCR), and sends the
 * results back as an {@link Evidence} payload.
 *
 * @param type Discriminator — always {@code "requisition"}.
 * @param needText 0-indexed page numbers requiring PDFBox plain-text extraction.
 * @param needTables 0-indexed page numbers requiring Tabula CSV extraction.
 * @param needOcr 0-indexed page numbers requiring OCRmyPDF.
 * @param rationale Human-readable reason logged for observability.
 */
public record Requisition(
        String type,
        List<Integer> needText,
        List<Integer> needTables,
        List<Integer> needOcr,
        String rationale) {

    public boolean isEmpty() {
        return (needText == null || needText.isEmpty())
                && (needTables == null || needTables.isEmpty())
                && (needOcr == null || needOcr.isEmpty());
    }
}
