package stirling.software.SPDF.model.api.ai;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

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
 * @param unautablePages Pages that were requested but could not be fulfilled — e.g. OCR was asked
 *     for but is not yet wired. The Auditor echoes these into {@link Verdict#unautablePages()} so
 *     the client knows coverage is incomplete.
 */
public record Evidence(
        @JsonProperty("session_id") String sessionId,
        List<Folio> folios,
        int round,
        @JsonProperty("final_round") boolean finalRound,
        @JsonProperty("unauditable_pages") List<Integer> unautablePages) {}
