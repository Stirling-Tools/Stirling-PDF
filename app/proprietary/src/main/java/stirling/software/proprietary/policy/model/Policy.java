package stirling.software.proprietary.policy.model;

import java.util.List;

/**
 * A stored automation: ordered tool steps, input bindings, and output destinations.
 *
 * <p>Always runnable on demand. An optional {@link TriggerConfig} fires it automatically; a {@code
 * null} trigger means manual-only. Trigger decides when; {@code sourceIds} reference the persisted
 * {@code Source} locations (resolved live at run time) files come from; a run pulls from every
 * referenced source. {@code outputIds} reference the {@code Source} locations (resolved live) a
 * run's files are delivered to - a run is delivered to every one; when empty the inline {@link
 * #output} is used (results returned to the caller), the case for editor and one-off policies.
 */
public record Policy(
        String id,
        String name,
        String owner,
        boolean enabled,
        List<PipelineInput> inputs,
        List<PipelineStep> steps,
        OutputSpec output,
        List<String> outputIds,
        Long teamId) {

    public Policy {
        inputs = inputs == null ? List.of() : List.copyOf(inputs);
        steps = steps == null ? List.of() : steps;
        output = output == null ? OutputSpec.inline() : output;
        outputIds = outputIds == null ? List.of() : List.copyOf(outputIds);
    }

    /**
     * Without output references: the inline output is used as-is. Kept for the engine, migrations,
     * and tests, and for editor/one-off policies that return results to the caller rather than a
     * stored destination.
     */
    public Policy(
            String id,
            String name,
            String owner,
            boolean enabled,
            TriggerConfig trigger,
            List<String> sourceIds,
            List<PipelineStep> steps,
            OutputSpec output,
            Long teamId) {
        this(id, name, owner, enabled, trigger, sourceIds, steps, output, List.of(), teamId);
    }

    /**
     * Without an explicit owning team. Kept for the engine and tests; the controller always stamps
     * a {@code teamId} on stored policies so they stay scoped to the creating user's team.
     */
    public Policy(
            String id,
            String name,
            String owner,
            boolean enabled,
            List<PipelineInput> inputs,
            List<PipelineStep> steps,
            OutputSpec output) {
        this(id, name, owner, enabled, inputs, steps, output, List.of(), null);
    }

    /** The source ids this policy pulls from, in input order; a derived view for reads. */
    public List<String> sourceIds() {
        return inputs.stream().map(PipelineInput::sourceId).toList();
    }

    /** A policy with no configured sources (a generator, or files supplied directly to a run). */
    public Policy(
            String id,
            String name,
            String owner,
            boolean enabled,
            TriggerConfig trigger,
            List<PipelineStep> steps,
            OutputSpec output) {
        this(id, name, owner, enabled, trigger, List.of(), steps, output, List.of(), null);
    }

    /** A copy with the inline output replaced (e.g. resolved for the engine, or migrated). */
    public Policy withOutput(OutputSpec resolved) {
        return new Policy(
                id, name, owner, enabled, trigger, sourceIds, steps, resolved, outputIds, teamId);
    }

    /** A copy referencing the given saved output destinations. */
    public Policy withOutputIds(List<String> newOutputIds) {
        return new Policy(
                id, name, owner, enabled, trigger, sourceIds, steps, output, newOutputIds, teamId);
    }

    /** The distinct trigger types configured across this policy's inputs (manual inputs aside). */
    public List<String> triggerTypes() {
        return inputs.stream()
                .map(PipelineInput::trigger)
                .filter(trigger -> trigger != null)
                .map(TriggerConfig::type)
                .distinct()
                .toList();
    }

    /**
     * This policy's pipeline as the engine sees it (inline output; destinations resolved
     * elsewhere).
     */
    public PipelineDefinition toDefinition() {
        return new PipelineDefinition(name, steps, output);
    }
}
