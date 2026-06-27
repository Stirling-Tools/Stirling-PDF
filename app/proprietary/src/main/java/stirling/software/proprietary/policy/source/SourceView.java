package stirling.software.proprietary.policy.source;

import java.util.List;

/**
 * One row in the Sources overview: a persisted input connection shown exactly once, with how many
 * policies reference it (and which). {@code docsTotal} is {@code null} - per-source document volume
 * is not tracked yet; the field is reserved so a later doc-accounting pass is additive.
 */
public record SourceView(
        String id,
        String name,
        String type,
        String status,
        int referenceCount,
        List<PolicyRef> referencingPolicies,
        List<DetailRow> config,
        Long docsTotal) {

    /** A policy that references this source. */
    public record PolicyRef(String id, String name) {}

    /** A key/value line summarising the source's config for display. */
    public record DetailRow(String label, String value) {}
}
