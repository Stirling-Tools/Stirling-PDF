package stirling.software.proprietary.policy.overview;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceAccessGuard;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Builds the Pipelines overview: every policy the caller's team owns, each annotated with its
 * referenced sources (resolved to display names), its pipeline steps, and a trigger/output summary.
 * Source names are resolved from the team's sources in memory rather than persisted on the policy,
 * so the view always reflects the live source set. This is the "all pipelines" admin surface; the
 * user-facing Policies page builds only a friendly subset of the same backend policies.
 */
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class PolicyOverviewService {

    private final PolicyStore policyStore;
    private final SourceStore sourceStore;
    private final PolicyAccessGuard policyAccessGuard;
    private final SourceAccessGuard sourceAccessGuard;

    public PoliciesOverviewResponse overview() {
        List<Policy> policies = policyAccessGuard.visibleFrom(policyStore);
        Map<String, String> sourceNames = sourceNames();

        List<PolicyView> views =
                policies.stream()
                        .map(policy -> toView(policy, sourceNames))
                        .sorted(
                                Comparator.comparing(
                                        PolicyView::name, String.CASE_INSENSITIVE_ORDER))
                        .toList();

        return new PoliciesOverviewResponse(buildKpis(policies), views);
    }

    /** Display names for every source the caller's team can see, keyed by source id. */
    private Map<String, String> sourceNames() {
        Map<String, String> names = new HashMap<>();
        for (Source source : sourceAccessGuard.visibleFrom(sourceStore)) {
            names.put(source.id(), source.name());
        }
        return names;
    }

    private static PolicyView toView(Policy policy, Map<String, String> sourceNames) {
        List<PolicyView.SourceRef> sources =
                policy.sourceIds().stream()
                        // An unresolved id (source deleted, or not visible) falls back to the id so
                        // the row still renders rather than dropping the reference silently.
                        .map(id -> new PolicyView.SourceRef(id, sourceNames.getOrDefault(id, id)))
                        .toList();
        List<String> steps = policy.steps().stream().map(PipelineStep::operation).toList();
        return new PolicyView(
                policy.id(),
                policy.name(),
                policy.enabled(),
                policy.enabled() ? "active" : "paused",
                triggerSummary(policy.trigger()),
                sources,
                steps,
                outputSummary(policy.output()),
                policy.owner());
    }

    /** A null trigger is a manual-only policy; otherwise the trigger's type keys the summary. */
    private static String triggerSummary(TriggerConfig trigger) {
        return trigger == null ? "manual" : trigger.type();
    }

    private static String outputSummary(OutputSpec output) {
        return output == null ? "inline" : output.type();
    }

    private static List<PolicyKpi> buildKpis(List<Policy> policies) {
        long total = policies.size();
        long active = policies.stream().filter(Policy::enabled).count();
        long paused = total - active;
        return List.of(
                new PolicyKpi(total, "pipelines"),
                new PolicyKpi(active, "running automatically"),
                new PolicyKpi(paused, "paused"));
    }
}
