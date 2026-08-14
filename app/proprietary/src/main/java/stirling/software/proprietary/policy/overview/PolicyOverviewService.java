package stirling.software.proprietary.policy.overview;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.controller.ProcessingFolderController;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceAccessGuard;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Builds the Pipelines overview: one row per policy the caller's team built on the Pipelines page,
 * with its sources resolved to live display names, its steps, and a trigger/output summary.
 * Frontend/catalogue policies (marked by a {@code categoryId} in their output options) belong to
 * the user-facing Policies page and are excluded; a folder-watch trigger is not a signal.
 */
@Service
@RequiredArgsConstructor
public class PolicyOverviewService {

    // Output-options key marking a frontend/catalogue policy (set by the Policies page and seeder).
    private static final String CATEGORY_OPTION = "categoryId";

    private final PolicyStore policyStore;
    private final SourceStore sourceStore;
    private final PolicyAccessGuard policyAccessGuard;
    private final SourceAccessGuard sourceAccessGuard;

    public PoliciesOverviewResponse overview() {
        // Processing folders are the editor's own surface (ProcessingFolderController); the
        // portal's pipelines overview never sees them.
        List<Policy> policies =
                policyAccessGuard.visibleFrom(policyStore).stream()
                        .filter(PolicyOverviewService::isPipeline)
                        .filter(policy -> !ProcessingFolderController.isProcessingFolder(policy))
                        .toList();
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

    private static boolean isPipeline(Policy policy) {
        return !isCataloguePolicy(policy);
    }

    /** A frontend/catalogue policy, marked by a {@code categoryId} in its output options. */
    private static boolean isCataloguePolicy(Policy policy) {
        OutputSpec output = policy.output();
        return output != null
                && output.options().get(CATEGORY_OPTION) instanceof String category
                && !category.isBlank();
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
                triggerSummary(policy),
                sources,
                steps,
                outputSummary(policy, sourceNames),
                policy.owner());
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
     * Summarise a policy's triggers for the overview row: "manual" when no input is triggered,
     * otherwise the distinct trigger types across its inputs (e.g. "folder-watch, schedule").
     */
    private static String triggerSummary(Policy policy) {
        List<String> types = policy.triggerTypes();
        return types.isEmpty() ? "manual" : String.join(", ", types);
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
