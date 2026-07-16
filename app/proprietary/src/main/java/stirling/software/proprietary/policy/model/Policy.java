package stirling.software.proprietary.policy.model;

import java.util.List;

/**
 * A stored automation: ordered tool steps, input sources, and an output destination.
 *
 * <p>Always runnable on demand. An optional {@link TriggerConfig} fires it automatically; a {@code
 * null} trigger means manual-only. Trigger decides when; {@code sourceIds} reference the persisted
 * {@code Source} connections (resolved live at run time) that decide where files come from; a run
 * pulls from every referenced source. {@code outputId}, when set, references the persisted {@code
 * Output} destination (resolved live at run time) a run's files are delivered to; when {@code null}
 * the inline {@link #output} is used (results returned to the caller), which is the case for editor
 * and one-off policies.
 */
public record Policy(
        String id,
        String name,
        String owner,
        boolean enabled,
        TriggerConfig trigger,
        List<String> sourceIds,
        List<PipelineStep> steps,
        OutputSpec output,
        String outputId,
        Long teamId) {

    public Policy {
        sourceIds = sourceIds == null ? List.of() : List.copyOf(sourceIds);
        steps = steps == null ? List.of() : steps;
        output = output == null ? OutputSpec.inline() : output;
    }

    /**
     * Without an output reference: the inline output is used as-is. Kept for the engine,
     * migrations, and tests, and for editor/one-off policies that return results to the caller
     * rather than a stored destination.
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
        this(id, name, owner, enabled, trigger, sourceIds, steps, output, null, teamId);
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
            TriggerConfig trigger,
            List<String> sourceIds,
            List<PipelineStep> steps,
            OutputSpec output) {
        this(id, name, owner, enabled, trigger, sourceIds, steps, output, null, null);
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
        this(id, name, owner, enabled, trigger, List.of(), steps, output, null, null);
    }

    /** A copy with the effective output resolved, for the engine to run against. */
    public Policy withOutput(OutputSpec resolved) {
        return new Policy(
                id, name, owner, enabled, trigger, sourceIds, steps, resolved, outputId, teamId);
    }

    /** A copy referencing the given saved output destination. */
    public Policy withOutputId(String newOutputId) {
        return new Policy(
                id, name, owner, enabled, trigger, sourceIds, steps, output, newOutputId, teamId);
    }

    /** This policy's pipeline as the engine sees it. */
    public PipelineDefinition toDefinition() {
        return new PipelineDefinition(name, steps, output);
    }
}
