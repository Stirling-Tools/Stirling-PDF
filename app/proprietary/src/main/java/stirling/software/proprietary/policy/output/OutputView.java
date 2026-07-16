package stirling.software.proprietary.policy.output;

import java.util.List;

/**
 * One row in the Outputs overview: a persisted output destination shown exactly once, with how many
 * policies write to it (and which).
 */
public record OutputView(
        String id,
        String name,
        String type,
        String status,
        int referenceCount,
        List<PolicyRef> referencingPolicies,
        List<DetailRow> config) {

    /** A policy that writes to this output. */
    public record PolicyRef(String id, String name) {}

    /** A key/value line summarising the output's config for display. */
    public record DetailRow(String label, String value) {}
}
