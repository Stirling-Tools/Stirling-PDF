package stirling.software.proprietary.policy.source;

import java.util.List;

/** One Sources-overview row; {@code webhookPath} is a webhook's delivery path, else null. */
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
        long docs30d,
        String webhookPath) {

    /** A policy that references this source. */
    public record PolicyRef(String id, String name) {}

    /** A key/value line summarising the source's config for display. */
    public record DetailRow(String label, String value) {}
}
