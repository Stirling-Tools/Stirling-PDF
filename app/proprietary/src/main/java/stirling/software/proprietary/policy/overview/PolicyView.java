package stirling.software.proprietary.policy.overview;

import java.util.List;

/**
 * One row in the unified Pipelines overview: a stored policy shown for the admin processor, with its
 * referenced sources resolved to names and its pipeline summarised. This surface lists every
 * backend policy - both the pipelines built in the full builder and the friendly "suggested"
 * policies - so a {@code required} policy (one the org mandates) reads the same as any other
 * pipeline here.
 */
public record PolicyView(
        String id,
        String name,
        boolean enabled,
        boolean required,
        String icon,
        String status,
        String trigger,
        List<SourceRef> sources,
        List<String> steps,
        String output,
        String owner) {

    /** A source a policy pulls documents from, resolved to its display name. */
    public record SourceRef(String id, String name) {}
}
