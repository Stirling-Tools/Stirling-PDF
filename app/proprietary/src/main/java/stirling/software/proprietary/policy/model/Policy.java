package stirling.software.proprietary.policy.model;

import java.util.List;

/**
 * A stored automation: an ordered chain of tool steps, with a trigger for when it runs, an input
 * source for the files it runs on, and an output destination for the results.
 *
 * <p>This is the feature's central configuration object - what a user defines and the engine runs.
 */
public record Policy(
        String id,
        String name,
        String owner,
        boolean enabled,
        TriggerConfig trigger,
        InputSpec input,
        List<PipelineStep> steps,
        OutputSpec output) {

    public Policy {
        trigger = trigger == null ? TriggerConfig.manual() : trigger;
        input = input == null ? InputSpec.none() : input;
        steps = steps == null ? List.of() : steps;
        output = output == null ? OutputSpec.inline() : output;
    }

    /** A policy with no configured input source (files supplied directly, e.g. manual runs). */
    public Policy(
            String id,
            String name,
            String owner,
            boolean enabled,
            TriggerConfig trigger,
            List<PipelineStep> steps,
            OutputSpec output) {
        this(id, name, owner, enabled, trigger, InputSpec.none(), steps, output);
    }

    /** The engine-level, trigger-agnostic view of this policy's pipeline. */
    public PipelineDefinition toDefinition() {
        return new PipelineDefinition(name, steps, output);
    }
}
