package stirling.software.SPDF.model.api.ai;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * The Auditor's final opinion on the document's mathematical integrity.
 *
 * <p>This is the terminal message in the audit negotiation; Java returns it to the client
 * once received from Python.
 *
 * @param type               Discriminator — always {@code "verdict"}.
 * @param sessionId          Matches the session opened by the original client request.
 * @param discrepancies      Every mathematical error found, sorted by page.
 * @param pagesExamined      0-indexed page numbers the Auditor actually inspected.
 * @param roundsTaken        How many negotiation rounds were needed (1–3).
 * @param summary            One or two sentences suitable for the end user.
 * @param clean              {@code true} iff no errors were found (warnings are tolerated).
 * @param unautablePages     Pages that could not be audited — typically image-only pages for
 *                           which OCR was requested but is not yet wired. The client should
 *                           indicate that these pages were not checked.
 */
public record Verdict(
        String type,
        @JsonProperty("session_id") String sessionId,
        List<AuditDiscrepancy> discrepancies,
        @JsonProperty("pages_examined") List<Integer> pagesExamined,
        @JsonProperty("rounds_taken") int roundsTaken,
        String summary,
        boolean clean,
        @JsonProperty("unauditable_pages") List<Integer> unautablePages) {

    public long errorCount() {
        return discrepancies == null
                ? 0
                : discrepancies.stream().filter(d -> "error".equals(d.severity())).count();
    }

    public long warningCount() {
        return discrepancies == null
                ? 0
                : discrepancies.stream().filter(d -> "warning".equals(d.severity())).count();
    }
}
