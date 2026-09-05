package stirling.software.proprietary.policy.overview;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceAccessGuard;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Builds the unified Pipelines overview: one row per policy the caller's team owns, with its
 * sources resolved to live display names, its steps, and a trigger/output summary. This lists EVERY
 * policy - both pipelines built in the full builder and the friendly "suggested" policies - since
 * the two surfaces were merged (a policy is a pipeline the org requires). No catalogue filter any
 * more.
 */
@Service
@RequiredArgsConstructor
public class PolicyOverviewService {

    private final PolicyStore policyStore;
    private final SourceStore sourceStore;
    private final PolicyAccessGuard policyAccessGuard;
    private final SourceAccessGuard sourceAccessGuard;

    public PoliciesOverviewResponse overview() {
        List<Policy> policies = policyAccessGuard.visibleFrom(policyStore).stream().toList();
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
                policy.required(),
                iconKey(policy),
                policy.enabled() ? "active" : "paused",
                triggerSummary(policy),
                sources,
                steps,
                outputSummary(policy, sourceNames),
                policy.owner(),
                policy.storeId());
    }

    /**
     * A policy that delivers to sources shows those locations' display names, comma-joined (each
     * falling back to its id if it's since been deleted or isn't visible); otherwise the inline
     * output's type.
     */
    private static String outputSummary(Policy policy, Map<String, String> sourceNames) {
        List<String> outputIds = policy.outputIds();
        if (!outputIds.isEmpty()) {
            return outputIds.stream()
                    .map(id -> sourceNames.getOrDefault(id, id))
                    .collect(Collectors.joining(", "));
        }
        return outputSummary(policy.output());
    }

    /**
     * The list-row icon key. The policy's first-class {@code icon} wins; otherwise a
     * template-derived policy falls back to its {@code categoryId} (the template-identity marker
     * the frontend maps to the category glyph). Empty when neither is set, so the frontend shows
     * its default.
     */
    private static String iconKey(Policy policy) {
        if (!policy.icon().isBlank()) {
            return policy.icon();
        }
        OutputSpec output = policy.output();
        if (output != null
                && output.options().get("categoryId") instanceof String category
                && !category.isBlank()) {
            return category;
        }
        return "";
    }

    /**
     * Summarise a policy's triggers for the overview row: "manual" when no input is triggered,
     * otherwise the distinct trigger types across its inputs (e.g. "folder-watch, schedule").
     *
     * <p>An editor policy has no wire input to trigger, but it is not manual either - it fires in
     * the editor on every upload or export, so it reports that rather than reading as on-demand.
     */
    private static String triggerSummary(Policy policy) {
        List<String> types = policy.triggerTypes();
        if (!types.isEmpty()) return String.join(", ", types);
        return policy.editorRunOn().map(runOn -> "editor-" + runOn).orElse("manual");
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
