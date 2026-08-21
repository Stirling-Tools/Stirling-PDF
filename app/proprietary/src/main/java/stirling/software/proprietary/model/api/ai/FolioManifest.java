package stirling.software.proprietary.model.api.ai;

import java.util.List;

/**
 * Java's opening move in the audit negotiation.
 *
 * <p>Built from a cheap PDFBox scan (character count + image detection) with no OCR or Tabula
 * involved. Sent to the Python Examiner, which replies with a {@link Requisition}.
 *
 * @param sessionId Opaque handle Java uses to locate the PDF on disk during this audit session.
 * @param pageCount Total number of pages in the document.
 * @param folioTypes One {@link FolioType} per page (0-indexed). {@code folioTypes.size() ==
 *     pageCount}.
 * @param round Which negotiation round this manifest belongs to (1–3).
 */
public record FolioManifest(
        String sessionId, int pageCount, List<FolioType> folioTypes, int round) {}
