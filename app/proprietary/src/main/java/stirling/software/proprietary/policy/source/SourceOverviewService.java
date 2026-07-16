package stirling.software.proprietary.policy.source;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.util.SecretMasker;

/**
 * Builds the Sources overview: every persisted source the caller's team owns, shown exactly once,
 * each annotated with the policies that reference it. Reference counts are derived by scanning the
 * team's policies in memory rather than persisted on the source - fine at admin-dashboard scale and
 * always consistent with the live policy set.
 */
@Service
@RequiredArgsConstructor
public class SourceOverviewService {

    private final SourceStore sourceStore;
    private final PolicyStore policyStore;
    private final SourceAccessGuard sourceAccessGuard;
    private final PolicyAccessGuard policyAccessGuard;
    private final SourceDocCounter docCounter;

    public SourcesResponse overview() {
        List<Source> sources = sourceAccessGuard.visibleFrom(sourceStore);
        List<Policy> policies = policyAccessGuard.visibleFrom(policyStore);

        Map<String, List<Policy>> referencesBySource = referencesBySource(policies);
        Map<String, DocStats> docStats =
                docCounter.statsFor(sources.stream().map(Source::id).toList());

        List<SourceView> persisted =
                sources.stream()
                        .map(
                                source ->
                                        toView(
                                                source,
                                                referencesBySource.getOrDefault(
                                                        source.id(), List.of()),
                                                docStats.getOrDefault(source.id(), DocStats.ZERO)))
                        .sorted(
                                Comparator.comparingInt(SourceView::referenceCount)
                                        .reversed()
                                        .thenComparing(SourceView::name))
                        .toList();

        // The editor is a built-in source: always present and pinned first. The KPI strip counts
        // only the connections a team configures, so the editor is left out of the KPIs.
        List<SourceView> views = new ArrayList<>();
        views.add(editorView(policies));
        views.addAll(persisted);

        return new SourcesResponse(buildKpis(persisted), views);
    }

    /**
     * The 30-day daily document series for one source (oldest first), for the expanded row's
     * sparkline.
     */
    public List<Long> dailySeries(String sourceId) {
        return docCounter.dailySeriesFor(sourceId);
    }

    /** The 30-day daily editor document series (oldest first) for the caller's team. */
    public List<Long> editorDailySeries() {
        return docCounter.dailySeriesFor(
                EditorSource.counterKey(sourceAccessGuard.currentTeamId()));
    }

    /**
     * The always-present editor row. It has no stored config; its documents are those the team has
     * processed by running policies from the editor, and it is "used by" every policy that targets
     * the editor as its source.
     */
    private SourceView editorView(List<Policy> policies) {
        String key = EditorSource.counterKey(sourceAccessGuard.currentTeamId());
        DocStats docs = docCounter.statsFor(List.of(key)).getOrDefault(key, DocStats.ZERO);
        List<SourceView.PolicyRef> refs =
                policies.stream()
                        .filter(SourceOverviewService::runsFromEditor)
                        .map(policy -> new SourceView.PolicyRef(policy.id(), policy.name()))
                        .toList();
        return new SourceView(
                EditorSource.ID,
                "Editor",
                EditorSource.TYPE,
                "active",
                refs.size(),
                refs,
                List.of(),
                docs.total(),
                docs.last24h(),
                docs.last30d(),
                null);
    }

    /**
     * Whether a policy runs from the editor. Editor membership is carried in the policy's output
     * metadata ({@code output.options.sources}) - a client-side list the editor writes when a
     * policy targets it - rather than as a persisted {@code sourceId}, because the editor is
     * virtual and has no stored source to reference.
     */
    private static boolean runsFromEditor(Policy policy) {
        Object sources = policy.output().options().get("sources");
        return sources instanceof List<?> list && list.contains(EditorSource.ID);
    }

    /** Policies referencing each source id, across the caller's visible policies. */
    private static Map<String, List<Policy>> referencesBySource(List<Policy> policies) {
        Map<String, List<Policy>> bySource = new HashMap<>();
        for (Policy policy : policies) {
            for (String sourceId : policy.sourceIds()) {
                bySource.computeIfAbsent(sourceId, key -> new ArrayList<>()).add(policy);
            }
        }
        return bySource;
    }

    private static SourceView toView(
            Source source, List<Policy> referencingPolicies, DocStats docs) {
        List<SourceView.PolicyRef> refs =
                referencingPolicies.stream()
                        .map(policy -> new SourceView.PolicyRef(policy.id(), policy.name()))
                        .toList();
        return new SourceView(
                source.id(),
                source.name(),
                source.type(),
                deriveStatus(source, refs.size()),
                refs.size(),
                refs,
                configRows(source),
                docs.total(),
                docs.last24h(),
                docs.last30d(),
                webhookPath(source));
    }

    private static String webhookPath(Source source) {
        if (!"webhook".equals(source.type())) {
            return null;
        }
        Object webhookId = source.options().get("webhookId");
        return webhookId == null ? null : "/api/v1/webhooks/" + webhookId;
    }

    /** A disabled (paused) source reads as "disabled"; an unreferenced one reads as "unused". */
    private static String deriveStatus(Source source, int referenceCount) {
        if (!source.enabled()) {
            return "disabled";
        }
        return referenceCount == 0 ? "unused" : "active";
    }

    /**
     * Generic key/value view of the source's config - works for any source type. Secret-bearing
     * options (e.g. an S3 secret access key) are redacted, not omitted, so the overview still shows
     * that a credential is configured.
     */
    private static List<SourceView.DetailRow> configRows(Source source) {
        Map<String, Object> masked = SecretMasker.mask(source.options());
        return source.options().keySet().stream()
                .map(
                        key ->
                                new SourceView.DetailRow(
                                        humanize(key), String.valueOf(masked.get(key))))
                .toList();
    }

    private static String humanize(String key) {
        if (key == null || key.isBlank()) {
            return key;
        }
        return Character.toUpperCase(key.charAt(0)) + key.substring(1);
    }

    private static List<SourceKpi> buildKpis(List<SourceView> sources) {
        long total = sources.size();
        long inUse = sources.stream().filter(source -> source.referenceCount() > 0).count();
        long orphaned = total - inUse;
        return List.of(
                new SourceKpi(total, "connections"),
                new SourceKpi(inUse, "referenced by a policy"),
                new SourceKpi(orphaned, "unused"));
    }
}
