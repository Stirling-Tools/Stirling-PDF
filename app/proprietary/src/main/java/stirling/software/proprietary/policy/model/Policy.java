package stirling.software.proprietary.policy.model;

import java.util.List;

/**
 * A stored, owned automation: how it is triggered, the ordered tool steps to run, and where its
 * output goes, plus identity and metadata.
 *
 * <p>This is the central object of the feature. Everything that runs a chain of tools is a use of a
 * Policy: a watched folder is a Policy with a folder {@link TriggerConfig} and a folder {@link
 * OutputSpec}; a scheduled job is a Policy with a schedule trigger; manual/Automate/AI runs execute
 * a Policy (or an ad-hoc {@link PipelineDefinition}) on demand. The engine itself only ever
 * executes the {@link PipelineDefinition} this exposes via {@link #toDefinition()} - it is
 * trigger-agnostic.
 *
 * <p>{@code enabled} gates automatic triggering (a disabled policy is not picked up by its
 * trigger); it does not block an explicit manual run.
 */
public record Policy(
        String id,
        String name,
        String owner,
        boolean enabled,
        TriggerConfig trigger,
        List<PipelineStep> steps,
        OutputSpec output) {

    public Policy {
        trigger = trigger == null ? TriggerConfig.manual() : trigger;
        steps = steps == null ? List.of() : steps;
        output = output == null ? OutputSpec.inline() : output;
    }

    /** The engine-level, trigger-agnostic view of this policy's pipeline. */
    public PipelineDefinition toDefinition() {
        return new PipelineDefinition(name, steps, output);
    }
}
