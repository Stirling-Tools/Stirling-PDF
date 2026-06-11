package stirling.software.proprietary.policy.model;

import java.util.List;

/**
 * A stored automation: ordered tool steps, input sources, and an output destination.
 *
 * <p>Always runnable on demand. An optional {@link TriggerConfig} fires it automatically; a {@code
 * null} trigger means manual-only. Trigger decides when, {@link InputSpec sources} decide where
 * files come from; a run pulls from every source.
 */
public record Policy(
        String id,
        String name,
        String owner,
        boolean enabled,
        TriggerConfig trigger,
        List<InputSpec> sources,
        List<PipelineStep> steps,
        OutputSpec output,
        Long teamId) {

    public Policy {
        sources = sources == null ? List.of() : List.copyOf(sources);
        steps = steps == null ? List.of() : steps;
        output = output == null ? OutputSpec.inline() : output;
    }

    /** Without an owning team — for engine runs; stored policies are stamped with a team. */
    public Policy(
            String id,
            String name,
            String owner,
            boolean enabled,
            TriggerConfig trigger,
            List<InputSpec> sources,
            List<PipelineStep> steps,
            OutputSpec output) {
        this(id, name, owner, enabled, trigger, sources, steps, output, null);
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
