package stirling.software.proprietary.policy.source;

import java.util.List;

/**
 * One row in the Sources overview: a persisted input connection shown exactly once, with how many
 * policies reference it (and which) and how many documents it has fed into runs ({@code docsTotal}
 * lifetime plus the trailing 24-hour and 30-day windows).
 */
public record SourceView(
        String id,
        String name,
        String type,
        String status,
        int referenceCount,
        List<PolicyRef> referencingPolicies,
        List<DetailRow> config,
        long docsTotal,
        long docs24h,
        long docs30d) {

    /** A policy that references this source. */
    public record PolicyRef(String id, String name) {}

    /** A key/value line summarising the source's config for display. */
    public record DetailRow(String label, String value) {}
}
