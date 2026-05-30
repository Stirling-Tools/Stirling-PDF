package stirling.software.proprietary.model.api.ai;

import java.util.List;

/**
 * The Auditor's final opinion on the document's mathematical integrity.
 *
 * <p>This is the terminal message in the audit negotiation; Java returns it to the client once
 * received from Python.
 *
 * @param type Discriminator — always {@code "verdict"}.
 * @param sessionId Matches the session opened by the original client request.
 * @param discrepancies Every mathematical error found, sorted by page.
 * @param pagesExamined 0-indexed page numbers the Auditor actually inspected.
 * @param roundsTaken How many negotiation rounds were needed (1–3).
 * @param summary One or two sentences suitable for the end user.
 * @param clean {@code true} iff no errors were found (warnings are tolerated).
 * @param unauditablePages Pages that could not be audited — typically image-only pages for which
 *     OCR was requested but is not yet wired. The client should indicate that these pages were not
 *     checked.
 */
public record Verdict(
        String type,
        String sessionId,
        List<AuditDiscrepancy> discrepancies,
        List<Integer> pagesExamined,
        int roundsTaken,
        String summary,
        boolean clean,
        List<Integer> unauditablePages) {

    public long errorCount() {
        return discrepancies == null
                ? 0
                : discrepancies.stream().filter(d -> d.severity() == AuditSeverity.ERROR).count();
    }

    public long warningCount() {
        return discrepancies == null
                ? 0
                : discrepancies.stream().filter(d -> d.severity() == AuditSeverity.WARNING).count();
    }
}
