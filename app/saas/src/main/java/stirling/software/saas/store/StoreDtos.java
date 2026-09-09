package stirling.software.saas.store;

import java.util.List;

/**
 * Wire shapes for the store API. The public records ({@link ListingSummary}, {@link ListingDetail},
 * {@link ListPage}) carry no publisher identity at all: not the team, not the user, not an email.
 * The only author field lives inside {@link Viewer}, which the service fills solely when the caller
 * is a member of the publishing team. {@code StoreDtoPrivacyTest} pins this.
 */
public final class StoreDtos {

    private StoreDtos() {}

    public record ListingSummary(
            String storeId,
            String slug,
            String name,
            String description,
            String category,
            String icon,
            List<String> tools,
            int starCount,
            int installCount,
            String updatedAt,
            boolean curated,
            boolean needsConnections,
            Boolean starred) {}

    /** Shown only to the publisher's teammates. Today this is the account name (Q1 in the epic). */
    public record Author(String displayName) {}

    public record Viewer(boolean starred, boolean isTeammate, Author author) {}

    public record ListingDetail(
            String storeId,
            String slug,
            String name,
            String description,
            String category,
            String icon,
            List<String> tools,
            int starCount,
            int installCount,
            String updatedAt,
            boolean curated,
            boolean needsConnections,
            Boolean starred,
            String firstPublishedAt,
            String latestChange,
            List<StoreManifest.Step> steps,
            List<StoreManifest.RequiredOnInstall> requiredOnInstall,
            String minimumStirlingVersion,
            Viewer viewer) {}

    public record ListPage(List<ListingSummary> items, String nextCursor, int total) {}

    /** The team-scoped management row. The only place a publisher's name appears. */
    public record TeamListing(
            String storeId,
            String name,
            int starCount,
            int installCount,
            StoreListing.Status status,
            StoreListing.RemovedBy removedBy,
            String updatedAt,
            String publishedBy) {}

    public record StarResponse(int starCount, boolean starred) {}

    public record InstallRequest(String target) {}

    public record InstallResponse(int installCount) {}
}
