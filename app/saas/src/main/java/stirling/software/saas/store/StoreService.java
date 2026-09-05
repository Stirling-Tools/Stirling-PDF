package stirling.software.saas.store;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

import stirling.software.common.model.tool.ToolDiagnostic;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.engine.PolicyValidator;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.saas.security.TeamSecurityExpressions;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * The pipeline store: publish a team's policy as a listing, browse and install listings, star them.
 *
 * <p>Rules that shape every method here: the server builds the manifest from the stored policy
 * (never from the client), a listing holds only its latest manifest, installs are copies the store
 * never hears from again, and publisher identity leaves this class only inside the team-scoped
 * {@link StoreDtos.Viewer} or {@link StoreDtos.TeamListing}. Search, filter and sort run in memory
 * over the listed rows, which is fine for the catalogue's first few thousand entries and keeps the
 * queries trivial; the FTS plan in the epic replaces it when volume asks for it.
 */
@Service
@Profile("saas")
@RequiredArgsConstructor
@ConditionalOnProperty(name = "stirling.store.enabled", havingValue = "true")
public class StoreService {

    static final int DEFAULT_PAGE_SIZE = 24;
    static final int MAX_PAGE_SIZE = 60;
    static final Set<String> CATEGORIES =
            Set.of("ingestion", "security", "classification", "compliance", "routing", "retention");
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    /** Publishing refused by the preflight; the report says why. */
    @Getter
    public static class PublishBlockedException extends RuntimeException {
        private final transient PreflightReport report;

        public PublishBlockedException(PreflightReport report) {
            super("Publishing is blocked by " + report.findings().size() + " finding(s)");
            this.report = report;
        }
    }

    private record Prepared(PreflightReport report, StoreManifestSanitizer.Result result) {}

    private record Viewer(Long userId, Long teamId) {}

    private final StoreListingRepository listings;
    private final StoreStarRepository stars;
    private final StoreInstallRepository installs;
    private final PolicyStore policyStore;
    private final PolicyAccessGuard policyAccessGuard;
    private final PolicyManagementAuthority policyManagementAuthority;
    private final PolicyValidator policyValidator;
    private final SourceStore sourceStore;
    private final TeamSecurityExpressions teamSecurity;
    private final TeamMembershipRepository memberships;
    private final UserRepository users;
    private final StoreManifestSanitizer sanitizer;
    private final StoreTextAuditor textAuditor;
    private final ObjectMapper objectMapper;

    // ------------------------------------------------------------------ publishing

    public PreflightReport preflight(PublishRequest request) {
        Policy policy = ownedPolicy(request);
        return prepare(policy, request, existingListingFor(policy).orElse(null)).report();
    }

    @Transactional
    public StoreDtos.ListingDetail publish(PublishRequest request) {
        requireCanPublish();
        Policy policy = ownedPolicy(request);
        StoreListing existing = existingListingFor(policy).orElse(null);
        if (existing != null) {
            requireNotStaffRemoved(existing);
        }
        Prepared prepared = prepare(policy, request, existing);
        if (!prepared.report().canPublish()) {
            throw new PublishBlockedException(prepared.report());
        }
        StoreListing listing = existing != null ? existing : newListing(policy.teamId());
        apply(listing, prepared, request);
        listing = listings.save(listing);
        linkPolicy(policy, listing);
        return toDetail(listing, viewer());
    }

    @Transactional
    public StoreDtos.ListingDetail republish(String storeId, PublishRequest request) {
        requireCanPublish();
        StoreListing listing = teamListing(storeId);
        requireNotStaffRemoved(listing);
        Policy policy = ownedPolicy(request);
        Prepared prepared = prepare(policy, request, listing);
        if (!prepared.report().canPublish()) {
            throw new PublishBlockedException(prepared.report());
        }
        apply(listing, prepared, request);
        listing = listings.save(listing);
        linkPolicy(policy, listing);
        return toDetail(listing, viewer());
    }

    /** Soft removal: the id stays, copies keep working, and the team can republish to restore. */
    @Transactional
    public void remove(String storeId) {
        requireCanPublish();
        StoreListing listing = teamListing(storeId);
        requireNotStaffRemoved(listing);
        listing.setStatus(StoreListing.Status.REMOVED);
        listing.setRemovedBy(StoreListing.RemovedBy.TEAM);
        listings.save(listing);
    }

    private Prepared prepare(Policy policy, PublishRequest request, StoreListing existing) {
        List<StoreFinding> findings = new ArrayList<>();
        boolean curated = existing != null && existing.isCurated();
        findings.addAll(textAuditor.audit(request, curated));
        String category =
                request.category() == null ? "" : request.category().toLowerCase(Locale.ROOT);
        if (!CATEGORIES.contains(category)) {
            findings.add(
                    StoreFinding.block(
                            "category",
                            "Choose a category",
                            "Pick one of the store categories.",
                            StoreFinding.Where.details()));
        }
        List<ToolDiagnostic> diagnostics = policyValidator.diagnoseChain(policy.steps(), null);
        StoreManifestSanitizer.Result result =
                sanitizer.sanitize(
                        policy,
                        new PublishRequest(
                                request.policyId(),
                                request.name(),
                                request.description(),
                                category,
                                request.whatChanged()),
                        sourceStore::get,
                        diagnostics);
        findings.addAll(result.findings());
        boolean canPublish = findings.stream().noneMatch(StoreFinding::blocks);
        PreflightReport report =
                new PreflightReport(
                        findings,
                        canPublish,
                        existing == null ? null : existing.getStoreId(),
                        canPublish ? result.manifest() : null);
        return new Prepared(report, result);
    }

    private void apply(StoreListing listing, Prepared prepared, PublishRequest request) {
        StoreManifest manifest = prepared.result().manifest();
        listing.setName(manifest.name());
        listing.setSlug(StoreIds.slugify(manifest.name()));
        listing.setDescription(manifest.description());
        listing.setCategory(manifest.category());
        listing.setIcon(manifest.icon());
        listing.setManifestJson(objectMapper.writeValueAsString(manifest));
        listing.setManifestSchemaVersion(manifest.manifestSchemaVersion());
        listing.setToolsJson(objectMapper.writeValueAsString(prepared.result().tools()));
        listing.setNeedsConnections(prepared.result().needsSetup());
        listing.setLatestChange(request.trimmedWhatChanged());
        listing.setPublishedByUserId(teamSecurity.currentUserId());
        listing.setRightsAcceptedAt(LocalDateTime.now());
        listing.setPublishedAt(LocalDateTime.now());
        listing.setStatus(StoreListing.Status.LISTED);
        listing.setRemovedBy(null);
    }

    private StoreListing newListing(Long teamId) {
        StoreListing listing = new StoreListing();
        String storeId = StoreIds.newStoreId();
        while (listings.existsByStoreId(storeId)) {
            storeId = StoreIds.newStoreId();
        }
        listing.setStoreId(storeId);
        listing.setPublisherTeamId(teamId);
        listing.setPublishedAt(LocalDateTime.now());
        return listing;
    }

    /**
     * The policy remembers its listing so the next publish is a republish and the builder can link
     * back.
     */
    private void linkPolicy(Policy policy, StoreListing listing) {
        if (!Objects.equals(policy.storeId(), listing.getStoreId())) {
            policyStore.save(policy.withStoreId(listing.getStoreId()));
        }
    }

    // ------------------------------------------------------------------ stars and installs

    @Transactional
    public StoreDtos.StarResponse setStar(String storeId, boolean starred) {
        Long userId = requireUserId();
        StoreListing listing = listedOrGone(storeId);
        boolean has = stars.existsByListingIdAndUserId(listing.getId(), userId);
        if (starred && !has) {
            stars.save(new StoreStar(listing.getId(), userId));
        } else if (!starred && has) {
            stars.deleteByListingIdAndUserId(listing.getId(), userId);
        }
        int count = (int) stars.countByListingId(listing.getId());
        listing.setStarCount(count);
        listings.save(listing);
        return new StoreDtos.StarResponse(count, starred);
    }

    /** One install per target per listing; a reinstall is not a second install. */
    @Transactional
    public StoreDtos.InstallResponse recordInstall(String storeId, String target) {
        Long teamId = requireTeamId();
        StoreListing listing = listedOrGone(storeId);
        StoreInstall.Target kind =
                "team".equalsIgnoreCase(target)
                        ? StoreInstall.Target.TEAM
                        : StoreInstall.Target.SERVER;
        if (!installs.existsByListingIdAndTargetKindAndTargetId(listing.getId(), kind, teamId)) {
            installs.save(
                    new StoreInstall(listing.getId(), kind, teamId, teamSecurity.currentUserId()));
        }
        int count = (int) installs.countByListingId(listing.getId());
        listing.setInstallCount(count);
        listings.save(listing);
        return new StoreDtos.InstallResponse(count);
    }

    // ------------------------------------------------------------------ reads

    public StoreDtos.ListPage list(
            String q,
            String sort,
            List<String> tools,
            String category,
            String cursor,
            Integer limit) {
        Viewer viewer = viewer();
        String query = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        String wantedCategory = category == null ? "" : category.trim().toLowerCase(Locale.ROOT);
        List<String> wantedTools = tools == null ? List.of() : tools;

        List<StoreListing> rows =
                new ArrayList<>(listings.findByStatus(StoreListing.Status.LISTED));
        List<StoreListing> matched = new ArrayList<>();
        StoreListing exact = null;
        for (StoreListing row : rows) {
            List<String> rowTools = tools(row);
            if (!wantedCategory.isEmpty() && !wantedCategory.equals(row.getCategory())) {
                continue;
            }
            if (!wantedTools.isEmpty() && !rowTools.containsAll(wantedTools)) {
                continue;
            }
            if (!query.isEmpty()) {
                if (query.equals(row.getStoreId())) {
                    exact = row;
                    continue;
                }
                boolean hit =
                        row.getName().toLowerCase(Locale.ROOT).contains(query)
                                || row.getDescription().toLowerCase(Locale.ROOT).contains(query)
                                || row.getSlug().contains(query)
                                || rowTools.stream().anyMatch(t -> t.contains(query));
                if (!hit) {
                    continue;
                }
            }
            matched.add(row);
        }
        matched.sort(comparator(sort));
        if (exact != null) {
            matched.add(0, exact);
        }

        int size = limit == null ? DEFAULT_PAGE_SIZE : Math.max(1, Math.min(MAX_PAGE_SIZE, limit));
        int offset = parseCursor(cursor);
        int end = Math.min(matched.size(), offset + size);
        List<StoreListing> page =
                offset >= matched.size() ? List.of() : matched.subList(offset, end);
        Set<Long> starredIds = starredIds(viewer, page);
        List<StoreDtos.ListingSummary> items =
                page.stream().map(row -> toSummary(row, viewer, starredIds)).toList();
        String next = end < matched.size() ? String.valueOf(end) : null;
        return new StoreDtos.ListPage(items, next, matched.size());
    }

    public StoreDtos.ListingDetail detail(String storeId) {
        Viewer viewer = viewer();
        StoreListing listing = find(storeId);
        if (!listing.isListed() && !isTeammate(listing, viewer)) {
            throw gone();
        }
        return toDetail(listing, viewer);
    }

    public StoreManifest manifest(String storeId) {
        return readManifest(listedOrGone(storeId));
    }

    public List<StoreDtos.TeamListing> teamListings() {
        Long teamId = requireTeamId();
        return listings.findByPublisherTeamIdOrderByPublishedAtDesc(teamId).stream()
                .map(
                        row ->
                                new StoreDtos.TeamListing(
                                        row.getStoreId(),
                                        row.getName(),
                                        row.getStarCount(),
                                        row.getInstallCount(),
                                        row.getStatus(),
                                        row.getRemovedBy(),
                                        iso(row.getPublishedAt()),
                                        displayName(row.getPublishedByUserId())))
                .toList();
    }

    public List<StoreDtos.ListingSummary> starred() {
        Viewer viewer = viewer();
        Long userId = requireUserId();
        List<Long> ids =
                stars.findByUserIdOrderByCreatedAtDesc(userId).stream()
                        .map(StoreStar::getListingId)
                        .toList();
        if (ids.isEmpty()) {
            return List.of();
        }
        List<StoreListing> rows =
                listings.findByIdIn(ids).stream().filter(StoreListing::isListed).toList();
        Set<Long> all = new HashSet<>(ids);
        return ids.stream()
                .map(id -> rows.stream().filter(r -> r.getId().equals(id)).findFirst().orElse(null))
                .filter(Objects::nonNull)
                .map(row -> toSummary(row, viewer, all))
                .toList();
    }

    // ------------------------------------------------------------------ helpers

    private Policy ownedPolicy(PublishRequest request) {
        if (request.policyId() == null || request.policyId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "policyId is required");
        }
        return policyStore
                .get(request.policyId())
                .filter(policyAccessGuard::canAccess)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND, "No policy: " + request.policyId()));
    }

    /** The listing this policy already publishes to, if it is one of the caller's team's. */
    private Optional<StoreListing> existingListingFor(Policy policy) {
        if (policy.storeId() == null) {
            return Optional.empty();
        }
        Long teamId = teamSecurity.currentUserTeamId();
        return listings.findByStoreId(policy.storeId())
                .filter(listing -> Objects.equals(listing.getPublisherTeamId(), teamId));
    }

    private StoreListing teamListing(String storeId) {
        Long teamId = requireTeamId();
        return listings.findByStoreId(storeId)
                .filter(listing -> Objects.equals(listing.getPublisherTeamId(), teamId))
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND, "No listing: " + storeId));
    }

    private StoreListing find(String storeId) {
        return listings.findByStoreId(storeId)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND, "No listing: " + storeId));
    }

    private StoreListing listedOrGone(String storeId) {
        StoreListing listing = find(storeId);
        if (!listing.isListed()) {
            throw gone();
        }
        return listing;
    }

    private static ResponseStatusException gone() {
        return new ResponseStatusException(
                HttpStatus.GONE, "This pipeline is no longer available in the store");
    }

    private static void requireNotStaffRemoved(StoreListing listing) {
        if (listing.getRemovedBy() == StoreListing.RemovedBy.STAFF) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "This listing was removed by Stirling and cannot be changed");
        }
    }

    private void requireCanPublish() {
        if (!policyManagementAuthority.canEditPolicies()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Only a team leader can publish to the store");
        }
        requireTeamId();
    }

    private Long requireTeamId() {
        Long teamId = teamSecurity.currentUserTeamId();
        if (teamId == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "A team is required");
        }
        return teamId;
    }

    private Long requireUserId() {
        Long userId = teamSecurity.currentUserId();
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Sign in to do that");
        }
        return userId;
    }

    private Viewer viewer() {
        return new Viewer(teamSecurity.currentUserId(), teamSecurity.currentUserTeamId());
    }

    private boolean isTeammate(StoreListing listing, Viewer viewer) {
        return viewer.userId() != null
                && memberships.existsByTeamIdAndUserId(
                        listing.getPublisherTeamId(), viewer.userId());
    }

    private Set<Long> starredIds(Viewer viewer, List<StoreListing> page) {
        if (viewer.userId() == null || page.isEmpty()) {
            return Set.of();
        }
        List<Long> ids = page.stream().map(StoreListing::getId).toList();
        return stars.findByUserIdAndListingIdIn(viewer.userId(), ids).stream()
                .map(StoreStar::getListingId)
                .collect(Collectors.toSet());
    }

    private String displayName(Long userId) {
        if (userId == null) {
            return null;
        }
        return users.findById(userId).map(User::getUsername).orElse(null);
    }

    private static Comparator<StoreListing> comparator(String sort) {
        Comparator<StoreListing> byName = Comparator.comparing(StoreListing::getName);
        String key = sort == null ? "stars" : sort.toLowerCase(Locale.ROOT);
        return switch (key) {
            case "newest" ->
                    Comparator.comparing(
                                    StoreListing::getCreatedAt,
                                    Comparator.nullsLast(Comparator.reverseOrder()))
                            .thenComparing(byName);
            case "installs" ->
                    Comparator.comparingInt(StoreListing::getInstallCount)
                            .reversed()
                            .thenComparing(
                                    Comparator.comparingInt(StoreListing::getStarCount).reversed())
                            .thenComparing(byName);
            default ->
                    Comparator.comparingInt(StoreListing::getStarCount)
                            .reversed()
                            .thenComparing(
                                    Comparator.comparingInt(StoreListing::getInstallCount)
                                            .reversed())
                            .thenComparing(byName);
        };
    }

    private static int parseCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return 0;
        }
        try {
            return Math.max(0, Integer.parseInt(cursor.trim()));
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bad cursor");
        }
    }

    private List<String> tools(StoreListing listing) {
        String json = listing.getToolsJson();
        if (json == null || json.isBlank()) {
            return List.of();
        }
        return objectMapper.readValue(json, STRING_LIST);
    }

    private StoreManifest readManifest(StoreListing listing) {
        return objectMapper.readValue(listing.getManifestJson(), StoreManifest.class);
    }

    private StoreDtos.ListingSummary toSummary(
            StoreListing row, Viewer viewer, Set<Long> starredIds) {
        return new StoreDtos.ListingSummary(
                row.getStoreId(),
                row.getSlug(),
                row.getName(),
                row.getDescription(),
                row.getCategory(),
                row.getIcon(),
                tools(row),
                row.getStarCount(),
                row.getInstallCount(),
                iso(row.getPublishedAt()),
                row.isCurated(),
                row.isNeedsConnections(),
                viewer.userId() == null ? null : starredIds.contains(row.getId()));
    }

    private StoreDtos.ListingDetail toDetail(StoreListing row, Viewer viewer) {
        StoreManifest manifest = readManifest(row);
        boolean starred =
                viewer.userId() != null
                        && stars.existsByListingIdAndUserId(row.getId(), viewer.userId());
        boolean teammate = isTeammate(row, viewer);
        StoreDtos.Viewer viewerInfo =
                viewer.userId() == null
                        ? null
                        : new StoreDtos.Viewer(
                                starred,
                                teammate,
                                teammate
                                        ? new StoreDtos.Author(
                                                displayName(row.getPublishedByUserId()))
                                        : null);
        return new StoreDtos.ListingDetail(
                row.getStoreId(),
                row.getSlug(),
                row.getName(),
                row.getDescription(),
                row.getCategory(),
                row.getIcon(),
                tools(row),
                row.getStarCount(),
                row.getInstallCount(),
                iso(row.getPublishedAt()),
                row.isCurated(),
                row.isNeedsConnections(),
                viewer.userId() == null ? null : starred,
                iso(row.getCreatedAt()),
                row.getLatestChange(),
                manifest.steps(),
                manifest.requiredOnInstall(),
                manifest.minimumStirlingVersion(),
                viewerInfo);
    }

    private static String iso(LocalDateTime time) {
        return time == null ? null : time.toInstant(ZoneOffset.UTC).toString();
    }
}
