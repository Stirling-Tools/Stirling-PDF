package stirling.software.SPDF.model.api.ai;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * The Python Examiner's shopping list: which pages Java must extract before
 * the Auditor can form an opinion.
 *
 * <p>Java parses this from the Examiner's response, fulfils it (text / tables / OCR),
 * and sends the results back as an {@link Evidence} payload.
 *
 * @param type       Discriminator — always {@code "requisition"}.
 * @param needText   0-indexed page numbers requiring PDFBox plain-text extraction.
 * @param needTables 0-indexed page numbers requiring Tabula CSV extraction.
 * @param needOcr    0-indexed page numbers requiring OCRmyPDF.
 * @param rationale  Human-readable reason logged for observability.
 */
public record Requisition(
        String type,
        @JsonProperty("need_text") List<Integer> needText,
        @JsonProperty("need_tables") List<Integer> needTables,
        @JsonProperty("need_ocr") List<Integer> needOcr,
        String rationale) {

    public boolean isEmpty() {
        return (needText == null || needText.isEmpty())
                && (needTables == null || needTables.isEmpty())
                && (needOcr == null || needOcr.isEmpty());
    }
}
