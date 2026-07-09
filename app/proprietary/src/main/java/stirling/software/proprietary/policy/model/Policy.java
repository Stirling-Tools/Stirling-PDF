package stirling.software.proprietary.policy.model;

import java.util.List;

/**
 * A stored automation: ordered tool steps, input sources, and an output destination.
 *
 * <p>Always runnable on demand. An optional {@link TriggerConfig} fires it automatically; a {@code
 * null} trigger means manual-only. Trigger decides when; {@code sourceIds} reference the persisted
 * {@code Source} connections (resolved live at run time) that decide where files come from; a run
 * pulls from every referenced source.
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
        Long teamId) {

    public Policy {
        sourceIds = sourceIds == null ? List.of() : List.copyOf(sourceIds);
        steps = steps == null ? List.of() : steps;
        output = output == null ? OutputSpec.inline() : output;
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
        this(id, name, owner, enabled, trigger, sourceIds, steps, output, null);
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
        this(id, name, owner, enabled, trigger, List.of(), steps, output, null);
    }

    /** This policy's pipeline as the engine sees it. */
    public PipelineDefinition toDefinition() {
        return new PipelineDefinition(name, steps, output);
    }
}
