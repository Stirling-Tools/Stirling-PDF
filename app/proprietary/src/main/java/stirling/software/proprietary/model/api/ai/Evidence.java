package stirling.software.proprietary.model.api.ai;

import java.util.List;

/**
 * Java's fulfilment package: the extracted content the Python Auditor asked for.
 *
 * <p>Sent after Java has fulfilled a {@link Requisition}. When {@code finalRound} is {@code true},
 * the Auditor must return a {@link Verdict} — Java will not honour further Requisitions.
 *
 * @param sessionId Matches the session opened by the original client request.
 * @param folios The extracted page content for each page in the Requisition.
 * @param round Which negotiation round this Evidence belongs to (1–3).
 * @param finalRound When {@code true}, the Auditor must commit to a Verdict this round.
 * @param unauditablePages Pages that were requested but could not be fulfilled — e.g. OCR was asked
 *     for but is not yet wired. The Auditor echoes these into {@link Verdict#unauditablePages()} so
 *     the client knows coverage is incomplete.
 */
public record Evidence(
        String sessionId,
        List<Folio> folios,
        int round,
        boolean finalRound,
        List<Integer> unauditablePages) {}
