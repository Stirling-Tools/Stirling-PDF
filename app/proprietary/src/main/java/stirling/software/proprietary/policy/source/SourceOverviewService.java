package stirling.software.proprietary.policy.source;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Builds the Sources overview: every persisted source the caller's team owns, shown exactly once,
 * each annotated with the policies that reference it. Reference counts are derived by scanning the
 * team's policies in memory rather than persisted on the source - fine at admin-dashboard scale and
 * always consistent with the live policy set.
 */
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
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

        List<SourceView> views =
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

        return new SourcesResponse(buildKpis(views), views);
    }

    /**
     * The 30-day daily document series for one source (oldest first), for the expanded row's
     * sparkline.
     */
    public List<Long> dailySeries(String sourceId) {
        return docCounter.dailySeriesFor(sourceId);
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
                docs.last30d());
    }

    /** A disabled (paused) source reads as "disabled"; an unreferenced one reads as "unused". */
    private static String deriveStatus(Source source, int referenceCount) {
        if (!source.enabled()) {
            return "disabled";
        }
        return referenceCount == 0 ? "unused" : "active";
    }

    /** Generic key/value view of the source's config - works for any source type. */
    private static List<SourceView.DetailRow> configRows(Source source) {
        return source.options().entrySet().stream()
                .map(
                        entry ->
                                new SourceView.DetailRow(
                                        humanize(entry.getKey()), String.valueOf(entry.getValue())))
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
