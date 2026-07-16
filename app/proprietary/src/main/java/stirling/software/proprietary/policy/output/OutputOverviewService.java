package stirling.software.proprietary.policy.output;

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
 * Builds the Outputs overview: every persisted output the caller's team owns, shown exactly once,
 * each annotated with the policies that write to it. Reference counts are derived by scanning the
 * team's policies in memory rather than persisted on the output - fine at admin-dashboard scale and
 * always consistent with the live policy set. Mirrors {@link
 * stirling.software.proprietary.policy.source.SourceOverviewService}.
 */
@Service
@RequiredArgsConstructor
public class OutputOverviewService {

    private final OutputStore outputStore;
    private final PolicyStore policyStore;
    private final OutputAccessGuard outputAccessGuard;
    private final PolicyAccessGuard policyAccessGuard;

    public OutputsResponse overview() {
        List<Output> outputs = outputAccessGuard.visibleFrom(outputStore);
        List<Policy> policies = policyAccessGuard.visibleFrom(policyStore);

        Map<String, List<Policy>> referencesByOutput = referencesByOutput(policies);

        List<OutputView> views =
                outputs.stream()
                        .map(
                                output ->
                                        toView(
                                                output,
                                                referencesByOutput.getOrDefault(
                                                        output.id(), List.of())))
                        .sorted(
                                Comparator.comparingInt(OutputView::referenceCount)
                                        .reversed()
                                        .thenComparing(OutputView::name))
                        .toList();

        return new OutputsResponse(buildKpis(views), views);
    }

    /** Policies referencing each output id, across the caller's visible policies. */
    private static Map<String, List<Policy>> referencesByOutput(List<Policy> policies) {
        Map<String, List<Policy>> byOutput = new HashMap<>();
        for (Policy policy : policies) {
            String outputId = policy.outputId();
            if (outputId != null && !outputId.isBlank()) {
                byOutput.computeIfAbsent(outputId, key -> new ArrayList<>()).add(policy);
            }
        }
        return byOutput;
    }

    private static OutputView toView(Output output, List<Policy> referencingPolicies) {
        List<OutputView.PolicyRef> refs =
                referencingPolicies.stream()
                        .map(policy -> new OutputView.PolicyRef(policy.id(), policy.name()))
                        .toList();
        return new OutputView(
                output.id(),
                output.name(),
                output.type(),
                deriveStatus(output, refs.size()),
                refs.size(),
                refs,
                configRows(output));
    }

    /** A disabled (paused) output reads as "disabled"; an unreferenced one reads as "unused". */
    private static String deriveStatus(Output output, int referenceCount) {
        if (!output.enabled()) {
            return "disabled";
        }
        return referenceCount == 0 ? "unused" : "active";
    }

    /**
     * Generic key/value view of the output's config - works for any output type. Secret-bearing
     * options are redacted, not omitted, so the overview still shows that a credential is
     * configured.
     */
    private static List<OutputView.DetailRow> configRows(Output output) {
        Map<String, Object> masked = SecretMasker.mask(output.options());
        return output.options().keySet().stream()
                .map(
                        key ->
                                new OutputView.DetailRow(
                                        humanize(key), String.valueOf(masked.get(key))))
                .toList();
    }

    private static String humanize(String key) {
        if (key == null || key.isBlank()) {
            return key;
        }
        return Character.toUpperCase(key.charAt(0)) + key.substring(1);
    }

    private static List<OutputKpi> buildKpis(List<OutputView> outputs) {
        long total = outputs.size();
        long inUse = outputs.stream().filter(output -> output.referenceCount() > 0).count();
        long orphaned = total - inUse;
        return List.of(
                new OutputKpi(total, "destinations"),
                new OutputKpi(inUse, "referenced by a policy"),
                new OutputKpi(orphaned, "unused"));
    }
}
