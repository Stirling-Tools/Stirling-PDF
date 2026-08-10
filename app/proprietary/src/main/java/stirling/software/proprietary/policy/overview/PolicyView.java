package stirling.software.proprietary.policy.overview;

import java.util.List;

/**
 * One row in the Pipelines overview: a stored policy shown for the admin portal, with its
 * referenced sources resolved to names and its pipeline summarised. The portal's "all pipelines"
 * surface lists every backend policy (the user-facing Policies page builds only a friendly subset
 * of these).
 */
public record PolicyView(
        String id,
        String name,
        boolean enabled,
        String status,
        String trigger,
        List<SourceRef> sources,
        List<String> steps,
        String output,
        String owner,
        /**
         * Where this pipeline came from when it wasn't built here - a converted legacy config - so
         * the list can say so rather than passing it off as the team's own work. Null for the
         * ordinary case.
         */
        String origin) {

    /** A source a policy pulls documents from, resolved to its display name. */
    public record SourceRef(String id, String name) {}
}
