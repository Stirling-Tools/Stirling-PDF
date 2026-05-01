package stirling.software.proprietary.model.api.ai.contradiction;

/**
 * A single textual contradiction found by the Python Contradiction Agent.
 *
 * <p>Two {@link Claim}s about the same canonical {@code subject} that cannot both be true. The
 * derived {@link #page1()} and {@link #page2()} accessors expose each claim's page for convenience.
 *
 * <p>Java counterpart of the Python {@code Contradiction} model in {@code
 * contracts/contradiction.py}; field names mirror the Python {@code ApiModel} camelCase
 * serialisation.
 *
 * @param subject Canonicalised subject the two claims share.
 * @param claim1 First claim (typically lower page number).
 * @param claim2 Second claim.
 * @param explanation One-sentence explanation of why the two claims conflict.
 * @param severity {@code ERROR} for definite conflict, {@code WARNING} for plausible tension.
 */
public record Contradiction(
        String subject,
        Claim claim1,
        Claim claim2,
        String explanation,
        ContradictionSeverity severity) {

    // page1/page2 mirror Python's sorted invariant (min/max of the two claim
    // pages) so callers can rely on page1 <= page2 regardless of which Claim
    // sits in the claim1/claim2 slot. See contracts/contradiction.py.

    /** Lower of the two claim pages (0-indexed). */
    public int page1() {
        return Math.min(claim1.page(), claim2.page());
    }

    /** Higher of the two claim pages (0-indexed). */
    public int page2() {
        return Math.max(claim1.page(), claim2.page());
    }
}
