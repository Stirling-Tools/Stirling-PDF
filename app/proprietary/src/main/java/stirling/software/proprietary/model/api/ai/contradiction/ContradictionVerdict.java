package stirling.software.proprietary.model.api.ai.contradiction;

import java.util.List;

/**
 * The Contradiction Agent's final opinion on the document's textual self-consistency.
 *
 * <p>This is the terminal message in the contradiction-audit negotiation; Java returns it to the
 * client once received from Python.
 *
 * <p>Java counterpart of the Python {@code ContradictionVerdict} model in {@code
 * contracts/contradiction.py}; field names mirror the Python {@code ApiModel} camelCase
 * serialisation.
 *
 * @param type Discriminator — always {@code "contradiction_verdict"}.
 * @param sessionId Matches the session opened by the original client request.
 * @param contradictions Every textual contradiction found, sorted by {@code (page1, page2)}.
 * @param pagesExamined 0-indexed page numbers the agent actually inspected.
 * @param roundsTaken How many negotiation rounds were needed (1–3).
 * @param summary One or two sentences suitable for the end user.
 * @param clean {@code true} iff no errors were found (warnings are tolerated).
 * @param unauditablePages Pages that could not be examined — typically image-only pages for which
 *     OCR was requested but is not yet wired. The client should indicate that these pages were not
 *     checked.
 */
public record ContradictionVerdict(
        String type,
        String sessionId,
        List<Contradiction> contradictions,
        List<Integer> pagesExamined,
        int roundsTaken,
        String summary,
        boolean clean,
        List<Integer> unauditablePages) {

    public long errorCount() {
        return contradictions == null
                ? 0
                : contradictions.stream()
                        .filter(c -> c.severity() == ContradictionSeverity.ERROR)
                        .count();
    }

    public long warningCount() {
        return contradictions == null
                ? 0
                : contradictions.stream()
                        .filter(c -> c.severity() == ContradictionSeverity.WARNING)
                        .count();
    }
}
