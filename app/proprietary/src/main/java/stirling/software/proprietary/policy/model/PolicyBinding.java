package stirling.software.proprietary.policy.model;

import java.util.List;

/**
 * A policy paired with one of its {@link PipelineInput}s: the unit a background trigger fires. A
 * policy with two triggered inputs yields two bindings, so each fires independently on its own
 * trigger and pulls only its own source.
 */
public record PolicyBinding(Policy policy, PipelineInput input) {

    /**
     * The bindings across these policies whose input carries a trigger of the given type. Shared by
     * the {@code PolicyStore} implementations so every backend derives a trigger's bindings the
     * same way. Callers pass the policies a background trigger should consider (i.e. the enabled
     * ones).
     */
    public static List<PolicyBinding> matching(List<Policy> policies, String triggerType) {
        return policies.stream()
                .flatMap(
                        policy ->
                                policy.inputs().stream()
                                        .filter(
                                                input ->
                                                        input.trigger() != null
                                                                && triggerType.equals(
                                                                        input.trigger().type()))
                                        .map(input -> new PolicyBinding(policy, input)))
                .toList();
    }
}
